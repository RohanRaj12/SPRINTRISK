import { fetchWithDelegatedToken } from "../services/index.js";
import { config } from "../config.js";
import { storeMemory } from "../services/memory-service.js";
import type { ToolDefinition } from "./types.js";

/**
 * dependency_mapper
 *
 * Read-only agent that builds a dependency graph between Jira tickets
 * and GitHub PRs. It discovers relationships by:
 * 1. Scanning PR titles/branches for Jira ticket keys (e.g. "ENG-402")
 * 2. Checking Jira ticket descriptions for PR/branch references
 * 3. Mapping base→head branch relationships for PR dependency chains
 *
 * All discovered relationships are stored as high-confidence "context"
 * memories, which future audit runs use for better diagnostics.
 *
 * This tool is 100% READ-ONLY — it only queries APIs and writes
 * to the in-memory memory store.
 */

/**
 * All GitHub API calls go through Auth0 Token Vault.
 * The Token Vault handles fallback to direct env tokens automatically.
 */
async function ghFetch(
  userId: string,
  url: string
): Promise<Response> {
  return fetchWithDelegatedToken(userId, "github", url, {
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
}

/**
 * All Jira API calls go through Auth0 Token Vault.
 * The Token Vault handles fallback to direct env tokens automatically.
 */
async function jiraFetch(
  userId: string,
  url: string
): Promise<Response> {
  return fetchWithDelegatedToken(userId, "jira", url);
}

interface DependencyLink {
  from: string;       // e.g. "ENG-402"
  fromType: "jira" | "github_pr";
  to: string;         // e.g. "owner/repo#114"
  toType: "jira" | "github_pr";
  relationship: string; // e.g. "implements", "blocks", "linked"
  confidence: number;
}

export const dependencyMapper: ToolDefinition = {
  name: "dependency_mapper",
  description:
    "Build a dependency graph between Jira tickets and GitHub PRs by " +
    "scanning PR titles/branches for ticket keys and vice versa. " +
    "Results are stored as high-confidence context memories for future " +
    "audit runs. This is a READ-ONLY operation.",
  parameters: {
    owner: {
      type: "string",
      description: 'GitHub org/owner (e.g. "acme-corp")',
    },
    repo: {
      type: "string",
      description: 'GitHub repo name (e.g. "backend-api")',
    },
    jira_site: {
      type: "string",
      description: 'Jira site domain (e.g. "mycompany.atlassian.net")',
    },
    project_key: {
      type: "string",
      description: 'Jira project key to scan (e.g. "ENG")',
    },
  },
  required: ["owner", "repo"],

  async execute(args, userId) {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const jiraSite = (args.jira_site as string) || config.jira.host;
    const projectKey = (args.project_key as string) || config.jira.defaultProject;
    const orgId = "default";

    const links: DependencyLink[] = [];

    // ── Step 1: Scan GitHub PRs for Jira ticket references ──
    try {
      const prsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=50`;
      const prsRes = await ghFetch(userId, prsUrl);

      if (prsRes.ok) {
        const prs = (await prsRes.json()) as Array<{
          number: number;
          title: string;
          head: { ref: string };
          base: { ref: string };
          body: string | null;
        }>;

        // Regex to find Jira keys like ENG-402, SPRINT-15, etc.
        const jiraKeyPattern = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

        for (const pr of prs) {
          const searchText = `${pr.title} ${pr.head.ref} ${pr.body ?? ""}`;
          const matches = searchText.match(jiraKeyPattern);

          if (matches) {
            const uniqueKeys = [...new Set(matches)];
            for (const jiraKey of uniqueKeys) {
              links.push({
                from: jiraKey,
                fromType: "jira",
                to: `${owner}/${repo}#${pr.number}`,
                toType: "github_pr",
                relationship: "implemented_by",
                confidence: 0.9,
              });
            }
          }

          // Check for PR-to-PR dependencies via non-main base branches
          if (
            pr.base.ref !== "main" &&
            pr.base.ref !== "master" &&
            pr.base.ref !== "develop"
          ) {
            // Find PRs that target the same branch this one branches from
            const dependentPR = prs.find(
              (other) =>
                other.head.ref === pr.base.ref && other.number !== pr.number
            );
            if (dependentPR) {
              links.push({
                from: `${owner}/${repo}#${pr.number}`,
                fromType: "github_pr",
                to: `${owner}/${repo}#${dependentPR.number}`,
                toType: "github_pr",
                relationship: "depends_on",
                confidence: 0.95,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(
        "[DependencyMapper] GitHub scan failed:",
        (err as Error).message
      );
    }

    // ── Step 2: Scan Jira tickets for GitHub PR references ──
    if (jiraSite && projectKey) {
      try {
        const jql = `project = "${projectKey}" AND statusCategory != Done ORDER BY updated DESC`;
        const jiraUrl = `https://${jiraSite}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,description&maxResults=50`;
        const jiraRes = await jiraFetch(userId, jiraUrl);

        if (jiraRes.ok) {
          const data = (await jiraRes.json()) as {
            issues: Array<{
              key: string;
              fields: {
                summary: string;
                description?: { content?: Array<{ content?: Array<{ text?: string }> }> } | null;
              };
            }>;
          };

          const prPattern = /#(\d+)|pull\/(\d+)/g;

          for (const issue of data.issues) {
            // Extract text from ADF description
            let descText = "";
            if (issue.fields.description?.content) {
              for (const block of issue.fields.description.content) {
                if (block.content) {
                  for (const inline of block.content) {
                    if (inline.text) descText += inline.text + " ";
                  }
                }
              }
            }

            const searchText = `${issue.fields.summary} ${descText}`;
            const prMatches = [...searchText.matchAll(prPattern)];

            for (const match of prMatches) {
              const prNum = match[1] || match[2];
              if (prNum) {
                // Avoid duplicates from Step 1
                const linkId = `${issue.key}->${owner}/${repo}#${prNum}`;
                const alreadyFound = links.some(
                  (l) =>
                    l.from === issue.key &&
                    l.to === `${owner}/${repo}#${prNum}`
                );
                if (!alreadyFound) {
                  links.push({
                    from: issue.key,
                    fromType: "jira",
                    to: `${owner}/${repo}#${prNum}`,
                    toType: "github_pr",
                    relationship: "references",
                    confidence: 0.7,
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(
          "[DependencyMapper] Jira scan failed:",
          (err as Error).message
        );
      }
    }

    // ── Step 3: Store all links as high-confidence context memories ──
    let storedCount = 0;
    for (const link of links) {
      storeMemory({
        orgId,
        type: "context",
        key: `dependency:${link.from}→${link.to}`,
        content: JSON.stringify({
          from: link.from,
          fromType: link.fromType,
          to: link.to,
          toType: link.toType,
          relationship: link.relationship,
          discoveredAt: new Date().toISOString(),
        }),
        confidence: link.confidence,
      });
      storedCount++;
    }

    // ── Summary ──
    const jiraToGH = links.filter(
      (l) => l.fromType === "jira" && l.toType === "github_pr"
    ).length;
    const prToPR = links.filter(
      (l) => l.fromType === "github_pr" && l.toType === "github_pr"
    ).length;

    return {
      success: true,
      totalLinks: links.length,
      jiraToGitHub: jiraToGH,
      prToPR,
      memoriesStored: storedCount,
      links,
      summary:
        `Dependency graph built: ${links.length} links found ` +
        `(${jiraToGH} Jira↔GitHub, ${prToPR} PR↔PR). ` +
        `${storedCount} context memories stored.`,
    };
  },
};
