import { fetchWithDelegatedToken } from "../services/index.js";
import { config } from "../config.js";
import type { ToolDefinition } from "./types.js";

/**
 * jira_commenter
 *
 * Posts comments on Jira tickets. Primary use case: when the CI↔Jira
 * Linker detects that a linked PR has failing CI, it adds a comment
 * to the Jira ticket with the failure context.
 *
 * This is a LOW RISK, reversible operation — comments are informational
 * and don't change ticket status, assignee, or priority.
 */

/**
 * All Jira API calls go through Auth0 Token Vault.
 * The Token Vault handles fallback to direct env tokens automatically.
 */
async function jiraFetch(
  userId: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetchWithDelegatedToken(userId, "jira", url, {
    ...options,
    headers: {
      ...Object.fromEntries(new Headers(options.headers).entries()),
      "Content-Type": "application/json",
    },
  });
}

export const jiraCommenter: ToolDefinition = {
  name: "jira_commenter",
  description:
    "Post a comment on a Jira ticket. Used to link CI failure context, " +
    "cross-reference GitHub PRs, or add agent insights to tickets. " +
    "This is a reversible, informational operation.",
  parameters: {
    jira_site: {
      type: "string",
      description:
        'The Jira Cloud site domain (e.g. "mycompany.atlassian.net")',
    },
    issue_key: {
      type: "string",
      description: 'The Jira issue key to comment on (e.g. "ENG-402")',
    },
    message: {
      type: "string",
      description:
        "The comment body. Supports Atlassian Document Format (ADF) plaintext.",
    },
    linked_pr: {
      type: "string",
      description:
        'Optional linked PR reference for cross-system context (e.g. "owner/repo#114")',
    },
    ci_status: {
      type: "string",
      description:
        'Optional CI status to include in the comment (e.g. "failing", "passing")',
    },
  },
  required: ["jira_site", "issue_key", "message"],

  async execute(args, userId) {
    const site = (args.jira_site as string) || config.jira.host;
    const issueKey = args.issue_key as string;
    const message = args.message as string;
    const linkedPR = args.linked_pr as string | undefined;
    const ciStatus = args.ci_status as string | undefined;

    // Validate issue key
    if (!/^[A-Z][A-Z0-9_]+-\d+$/i.test(issueKey)) {
      throw new Error(
        `Invalid issue key: "${issueKey}". Expected format like "ENG-402".`
      );
    }

    // Build comment body
    let fullMessage = `🤖 *SPRINTRISK Agent*\n\n${message}`;
    if (linkedPR) {
      fullMessage += `\n\n📎 Linked PR: ${linkedPR}`;
    }
    if (ciStatus) {
      const icon = ciStatus.includes("fail") ? "❌" : ciStatus.includes("pass") ? "✅" : "⚠️";
      fullMessage += `\n${icon} CI Status: ${ciStatus}`;
    }
    fullMessage += `\n\n_Posted by SPRINTRISK at ${new Date().toISOString()}_`;

    // Jira REST API v3: POST /rest/api/3/issue/{key}/comment
    // Uses Atlassian Document Format (ADF)
    const url = `https://${site}/rest/api/3/issue/${issueKey}/comment`;
    const payload = {
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: fullMessage,
              },
            ],
          },
        ],
      },
    };

    const response = await jiraFetch(userId, url, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Jira API error ${response.status}: ${body}`,
      };
    }

    const result = (await response.json()) as {
      id: string;
      self: string;
    };

    return {
      success: true,
      commentId: result.id,
      issueKey,
      message: `Comment posted on ${issueKey}${linkedPR ? ` (linked to ${linkedPR})` : ""}`,
    };
  },
};
