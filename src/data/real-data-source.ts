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
    try {
      const url = "https://api.github.com/user/repos?per_page=5&sort=updated";
      const response = await fetchWithDelegatedToken(userId, "github", url, {
        headers: { "X-GitHub-Api-Version": "2022-11-28" },
      });

      if (!response.ok) return [];

      const repos = (await response.json()) as Array<{
        owner: { login: string };
        name: string;
      }>;

      const prs: PRItem[] = [];
      for (const repo of repos.slice(0, 3)) {
        try {
          const prUrl = `https://api.github.com/repos/${repo.owner.login}/${repo.name}/pulls?state=open&per_page=10`;
          const prResponse = await fetchWithDelegatedToken(userId, "github", prUrl, {
            headers: { "X-GitHub-Api-Version": "2022-11-28" },
          });

          if (!prResponse.ok) continue;

          const repoPRs = (await prResponse.json()) as Array<{
            number: number;
            title: string;
            user: { login: string };
            created_at: string;
            draft: boolean;
            html_url: string;
            requested_reviewers: Array<{ login: string }>;
            labels: Array<{ name: string }>;
          }>;

          for (const pr of repoPRs) {
            const ageInDays = Math.floor(
              (Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)
            );
            prs.push({
              number: pr.number,
              title: pr.title,
              author: pr.user.login,
              status: pr.draft ? "draft" : "open",
              ageInDays,
              ciStatus: "unknown",
              url: pr.html_url,
              pendingReviewers: pr.requested_reviewers.map((r) => r.login),
              labels: pr.labels.map((l) => l.name),
            });
          }
        } catch {
          // Skip repos that fail
        }
      }

      return prs;
    } catch (err) {
      console.warn("[RealDataSource] GitHub PRs fetch failed:", (err as Error).message);
      return [];
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
        status: s.status === "checking" ? "disconnected" as const : s.status as "connected" | "disconnected" | "error",
        account: s.account,
        lastSync: s.lastChecked,
        scopes: s.scopes,
        error: s.error,
      }));
  }

  // ── Private helpers ──

  private async fetchJiraIssues(userId: string): Promise<SprintIssue[]> {
    // This is a simplified version; real implementation would use config for site/project
    const url =
      "https://api.atlassian.com/ex/jira/cloud/rest/api/3/search?jql=statusCategory!=Done&maxResults=20&fields=summary,status,assignee,updated,priority";
    const response = await fetchWithDelegatedToken(userId, "jira", url);

    if (!response.ok) return [];

    const data = (await response.json()) as {
      issues: Array<{
        key: string;
        fields: {
          summary: string;
          status: { name: string };
          assignee: { displayName: string } | null;
          updated: string;
        };
      }>;
    };

    const now = Date.now();
    return data.issues.map((issue) => {
      const daysSinceUpdate = Math.floor(
        (now - new Date(issue.fields.updated).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: issue.key,
        title: issue.fields.summary,
        assignee: issue.fields.assignee?.displayName ?? "Unassigned",
        status: daysSinceUpdate >= 3 ? "stale" : "healthy",
        daysStale: daysSinceUpdate >= 3 ? daysSinceUpdate : undefined,
        provider: "jira" as const,
      };
    });
  }

  private async fetchGithubAsIssues(userId: string): Promise<SprintIssue[]> {
    const prs = await this.getGithubPRs(userId);
    return prs.slice(0, 5).map((pr) => ({
      id: `PR-${pr.number}`,
      title: pr.title,
      assignee: pr.author,
      status: pr.ageInDays >= 3 ? ("stale" as const) : pr.pendingReviewers.length > 0 ? ("review" as const) : ("healthy" as const),
      daysStale: pr.ageInDays >= 3 ? pr.ageInDays : undefined,
      provider: "github" as const,
    }));
  }
}
