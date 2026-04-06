/**
 * Sprint Guardian — Real DataSource Implementation
 *
 * Fetches live data from GitHub, Jira, and Slack via Auth0 Token Vault.
 * Returns empty arrays when integrations are not connected.
 * NEVER falls back to demo data silently.
 */

import type {
  DataSource,
  SprintIssue,
  PRItem,
  DashboardApproval,
  DashboardAuditEntry,
  IntegrationStatus,
} from "./data-source.js";
import { fetchWithDelegatedToken } from "../services/index.js";

export class RealDataSource implements DataSource {
  readonly source = "live" as const;

  // Simple in-memory cache for GitHub PRs and Issues to avoid rate limits (1 hour TTL)
  private cache = new Map<string, { timestamp: number; data: unknown }>();
  private CACHE_TTL_MS = 60 * 60 * 1000;

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.CACHE_TTL_MS) {
      return entry.data as T;
    }
    return null;
  }

  private setCache(key: string, data: unknown) {
    this.cache.set(key, { timestamp: Date.now(), data });
  }

  /**
   * Clear the dashboard cache for a user (e.g. when settings are updated).
   */
  clearCache(userId: string) {
    this.cache.delete(`gh_prs_${userId}`);
    this.cache.delete(`gh_issues_${userId}`);
    console.info(`[RealDataSource] Cache cleared for user: ${userId}`);
  }

  async getSprintIssues(userId: string): Promise<SprintIssue[]> {
    const issues: SprintIssue[] = [];

    // Attempt to fetch from Jira
    try {
      const jiraIssues = await this.fetchJiraIssues(userId);
      issues.push(...jiraIssues);
    } catch (err) {
      console.warn("[RealDataSource] Jira fetch failed (integration may not be connected):", (err as Error).message);
    }

    // Attempt to fetch from GitHub
    try {
      const ghIssues = await this.fetchGithubAsIssues(userId);
      issues.push(...ghIssues);
    } catch (err) {
      console.warn("[RealDataSource] GitHub fetch failed (integration may not be connected):", (err as Error).message);
    }

    return issues;
  }

  async getGithubPRs(userId: string): Promise<PRItem[]> {
    const cacheKey = `gh_prs_${userId}`;
    const cached = this.getCached<PRItem[]>(cacheKey);
    if (cached) return cached;

    try {
      const { getOrgConfig } = await import("../routes/settings.js");
      const orgConfig = getOrgConfig("default");
      const targetedOwner = orgConfig.github.owner;
      const targetedRepo = orgConfig.github.repo;

      const prs: PRItem[] = [];

      if (targetedOwner && targetedRepo) {
        console.info(`[RealDataSource] Fetching targeted GitHub PRs for ${targetedOwner}/${targetedRepo}`);
        // Fetch specific repo PRs
        const prUrl = `https://api.github.com/repos/${targetedOwner}/${targetedRepo}/pulls?state=open&per_page=20`;
        const prResponse = await fetchWithDelegatedToken(userId, "github", prUrl, {
          headers: { "X-GitHub-Api-Version": "2022-11-28" },
        });

        console.info(`[RealDataSource] GitHub PR response: ${prResponse.status} ${prResponse.statusText}`);

        if (prResponse.ok) {
          const repoPRs = (await prResponse.json()) as Array<any>;
          console.info(`[RealDataSource] Found ${repoPRs.length} PRs for ${targetedOwner}/${targetedRepo}`);
          this.mapGitHubPRs(repoPRs, prs);
        } else {
          const errBody = await prResponse.text();
          console.warn(`[RealDataSource] GitHub PR fetch failed: ${prResponse.status} ${errBody}`);
        }
      } else {
        // Fallback: Fetch generic user repos
        const url = "https://api.github.com/user/repos?per_page=5&sort=updated";
        const response = await fetchWithDelegatedToken(userId, "github", url, {
          headers: { "X-GitHub-Api-Version": "2022-11-28" },
        });

        if (!response.ok) return [];

        const repos = (await response.json()) as Array<{ owner: { login: string }; name: string; }>;

        for (const repo of repos.slice(0, 3)) {
          try {
            const prUrl = `https://api.github.com/repos/${repo.owner.login}/${repo.name}/pulls?state=open&per_page=10`;
            const prResponse = await fetchWithDelegatedToken(userId, "github", prUrl, {
              headers: { "X-GitHub-Api-Version": "2022-11-28" },
            });
            if (prResponse.ok) {
              const repoPRs = (await prResponse.json()) as Array<any>;
              this.mapGitHubPRs(repoPRs, prs);
            }
          } catch {
            // Skip repos that fail
          }
        }
      }

      this.setCache(cacheKey, prs);
      return prs;
    } catch (err) {
      console.warn("[RealDataSource] GitHub PRs fetch failed:", (err as Error).message);
      return [];
    }
  }

  // Helper mapping function for PRs
  private mapGitHubPRs(repoPRs: any[], prs: PRItem[]) {
    for (const pr of repoPRs) {
      const ageInDays = Math.floor(
        (Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      prs.push({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login || "Unknown",
        status: pr.draft ? "draft" : "open",
        ageInDays,
        ciStatus: "unknown",
        url: pr.html_url,
        pendingReviewers: pr.requested_reviewers?.map((r: any) => r.login) || [],
        labels: pr.labels?.map((l: any) => l.name) || [],
      });
    }
  }

  async getApprovals(_orgId: string): Promise<DashboardApproval[]> {
    // In a full implementation, this would query the approvals table.
    // For now, return empty (no mock fallback).
    return [];
  }

  async getAuditLogs(_orgId: string): Promise<DashboardAuditEntry[]> {
    // In a full implementation, this would query the audit_logs table.
    return [];
  }

  async getIntegrationStatus(userId: string): Promise<IntegrationStatus[]> {
    // Use the ConnectionManager for real-time status
    const { getConnectionManager } = await import("../integrations/connection-manager.js");
    const manager = getConnectionManager();
    const statuses = manager.getAllStatuses();

    return statuses
      .filter((s) => s.provider !== "auth0")
      .map((s) => ({
        provider: s.provider as "jira" | "github" | "slack",
        displayName: s.displayName,
        description: s.description,
        status: (s.status === "checking" || s.status === "not_linked") ? "disconnected" as const : s.status as "connected" | "disconnected" | "error",
        account: s.account,
        lastSync: s.lastChecked,
        scopes: s.scopes,
        error: s.error,
      }));
  }

  // ── Private helpers ──

  private async fetchJiraIssues(userId: string): Promise<SprintIssue[]> {
    const { getJiraClient, createJiraClientWithToken } = await import("../integrations/jira-client.js");
    const { getOrgConfig } = await import("../routes/settings.js");
    const { config } = await import("../config.js");

    const orgConfig = getOrgConfig("default");

    // Try to get a Jira client — Token Vault first, then direct credentials
    let client: import("../integrations/jira-client.js").JiraClient | null = null;

    // Step 1: Try Token Vault (primary path for OAuth-linked users)
    try {
      const { getDelegatedToken } = await import("../services/token-vault.js");
      const delegated = await getDelegatedToken(userId, "jira");
      const jiraHost = orgConfig.jira.site || config.jira.host;

      if (jiraHost && delegated.access_token) {
        if (delegated.isFallback) {
          // Fallback token is base64(email:token) for Basic auth — use direct client
          client = getJiraClient();
          console.info(`[RealDataSource] Using direct Jira credentials (fallback) for user ${userId}`);
        } else {
          // Real Token Vault OAuth token — use Bearer auth
          client = createJiraClientWithToken(jiraHost, delegated.access_token);
          console.info(`[RealDataSource] Using Token Vault Jira OAuth token for user ${userId}`);
        }
      } else if (!jiraHost) {
        console.warn("[RealDataSource] Token Vault has Jira token but no host configured. Set jira.site in org settings or JIRA_HOST env var.");
      }
    } catch (err) {
      console.warn("[RealDataSource] Token Vault Jira token unavailable:", (err as Error).message);
    }

    // Step 2: Fall back to direct credentials
    if (!client) {
      client = getJiraClient();
    }

    if (!client) {
      console.warn("[RealDataSource] Jira client unavailable — no Token Vault token or direct credentials configured.");
      return [];
    }

    // Project key: user settings take priority, then env fallback
    const projectKey = orgConfig.jira.projectKey || config.jira.defaultProject;
    if (!projectKey) {
      console.warn(
        "[RealDataSource] No Jira project key configured. Set jira.projectKey in org settings or JIRA_DEFAULT_PROJECT env var. " +
        "Attempting to discover projects..."
      );
      // Try to discover available projects
      try {
        const boards = await client.getBoards("");
        if (boards.length > 0) {
          console.info(`[RealDataSource] Discovered board: ${boards[0].name} (project: ${boards[0].location?.projectKey || "unknown"})`);
        }
      } catch {
        // Best-effort discovery
      }
      return [];
    }
    const staleDays = orgConfig.jira.staleThresholdDays || 3;

    try {
      // Step 1: Try to get active sprint issues via board API
      let sprintIssues: import("../integrations/jira-client.js").JiraIssue[] = [];
      try {
        const boards = await client.getBoards(projectKey);
        if (boards.length > 0) {
          const sprints = await client.getActiveSprints(boards[0].id);
          if (sprints.length > 0) {
            sprintIssues = await client.getSprintIssues(sprints[0].id);
            console.info(`[RealDataSource] Loaded ${sprintIssues.length} issues from active sprint "${sprints[0].name}"`);
          }
        }
      } catch (boardErr) {
        console.warn("[RealDataSource] Board/sprint fetch failed, falling back to open issues:", (boardErr as Error).message);
      }

      // Step 2: Fall back to all open issues if no sprint found
      if (sprintIssues.length === 0) {
        sprintIssues = await client.getOpenIssues(projectKey, 50);
        console.info(`[RealDataSource] Loaded ${sprintIssues.length} open issues from project ${projectKey}`);
      }

      // Step 3: In parallel, fetch stale + blocked sets for accurate status tagging
      const [staleIssues, blockedIssues] = await Promise.allSettled([
        client.getStaleIssues(projectKey, staleDays),
        client.getBlockedIssues(projectKey),
      ]);

      const staleKeys = new Set(
        staleIssues.status === "fulfilled" ? staleIssues.value.map((i) => i.key) : []
      );
      const blockedKeys = new Set(
        blockedIssues.status === "fulfilled" ? blockedIssues.value.map((i) => i.key) : []
      );

      const now = Date.now();

      return sprintIssues.map((issue) => {
        const daysSinceUpdate = Math.floor(
          (now - new Date(issue.fields.updated).getTime()) / (1000 * 60 * 60 * 24)
        );

        let status: SprintIssue["status"] = "healthy";
        if (blockedKeys.has(issue.key)) {
          status = "blocked";
        } else if (staleKeys.has(issue.key) || daysSinceUpdate >= staleDays) {
          status = "stale";
        } else if (
          issue.fields.status?.name?.toLowerCase().includes("review") ||
          issue.fields.status?.name?.toLowerCase().includes("testing")
        ) {
          status = "review";
        }

        return {
          id: issue.key,
          title: issue.fields.summary,
          assignee: issue.fields.assignee?.displayName ?? "Unassigned",
          status,
          daysStale: status === "stale" ? daysSinceUpdate : undefined,
          priority: issue.fields.priority?.name,
          issueType: issue.fields.issuetype?.name,
          provider: "jira" as const,
          url: config.jira.host ? `${config.jira.host.replace(/\/$/, "")}/browse/${issue.key}` : `https://jira.atlassian.net/browse/${issue.key}`,
        };
      });
    } catch (err) {
      console.warn("[RealDataSource] Jira fetch failed:", (err as Error).message);
      return [];
    }
  }

  private async fetchGithubAsIssues(userId: string): Promise<SprintIssue[]> {
    const prs = await this.getGithubPRs(userId);
    const mappedPRs = prs.slice(0, 5).map((pr) => ({
      id: `PR-${pr.number}`,
      title: pr.title,
      assignee: pr.author,
      status: pr.ageInDays >= 3 ? ("stale" as const) : pr.pendingReviewers.length > 0 ? ("review" as const) : ("healthy" as const),
      daysStale: pr.ageInDays >= 3 ? pr.ageInDays : undefined,
      provider: "github" as const,
      issueType: "Pull Request",
      url: pr.url,
    }));

    // Fetch standard GitHub Issues (if configured)
    const cacheKey = `gh_issues_${userId}`;
    let issues: SprintIssue[] = this.getCached<SprintIssue[]>(cacheKey) || [];

    if (!this.getCached(cacheKey)) {
      try {
        const { getOrgConfig } = await import("../routes/settings.js");
        const orgConfig = getOrgConfig("default");
        const targetedOwner = orgConfig.github.owner;
        const targetedRepo = orgConfig.github.repo;

        if (targetedOwner && targetedRepo) {
          const issuesUrl = `https://api.github.com/repos/${targetedOwner}/${targetedRepo}/issues?state=open&per_page=10`;
          const response = await fetchWithDelegatedToken(userId, "github", issuesUrl, {
            headers: { "X-GitHub-Api-Version": "2022-11-28" },
          });

          if (response.ok) {
            const rawIssues = (await response.json()) as Array<any>;
            // GitHub REST API returns PRs inside /issues endpoint too, so we must filter them out
            const standardIssues = rawIssues.filter((issue: any) => !issue.pull_request);

            for (const issue of standardIssues.slice(0, 5)) {
              const ageInDays = Math.floor(
                (Date.now() - new Date(issue.created_at).getTime()) / (1000 * 60 * 60 * 24)
              );
              issues.push({
                id: `ISSUE-${issue.number}`,
                title: issue.title,
                assignee: issue.assignee?.login || issue.user?.login || "Unassigned",
                status: ageInDays >= 3 ? "stale" : "healthy",
                daysStale: ageInDays >= 3 ? ageInDays : undefined,
                provider: "github" as const,
                issueType: "Issue",
                url: issue.html_url,
              });
            }
          }
        }
        this.setCache(cacheKey, issues);
      } catch (err) {
        console.warn("[RealDataSource] GitHub Issues fetch failed:", (err as Error).message);
      }
    }

    return [...mappedPRs, ...issues];
  }
}
