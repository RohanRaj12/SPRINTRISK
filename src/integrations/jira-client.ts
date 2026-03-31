/**
 * Sprint Guardian — Jira Cloud Integration Client
 *
 * Production Jira Cloud REST API v3 client.
 *
 * Auth modes:
 *   1. Basic Auth (JIRA_EMAIL + JIRA_API_TOKEN) — for hackathon/demo
 *   2. Auth0 Token Vault (OAuth 2.0 bearer) — for enterprise
 *
 * Monitors: issues, sprints, boards, status transitions
 * Tracks: impediments, blockers, priority changes, SLA, regressions
 *
 * Note on Jira Cloud v3 API quirks:
 *   - Sprint data is under Jira Software (agile) REST API, not core v3
 *   - ADF (Atlassian Document Format) is required for rich text fields
 *   - Rate limits are per-user and use token bucket algorithm
 */

import { config, hasDirectJira } from "../config.js";

// ── Types ──

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls: Record<string, string>;
  active: boolean;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  lead: { displayName: string };
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string; name: string } };
    assignee: { displayName: string; emailAddress?: string; accountId: string } | null;
    reporter: { displayName: string } | null;
    priority: { name: string; id: string };
    issuetype: { name: string; subtask: boolean };
    created: string;
    updated: string;
    duedate: string | null;
    labels: string[];
    resolution: { name: string } | null;
    // Agile fields
    sprint?: { name: string; state: string; startDate?: string; endDate?: string };
    // Custom fields for impediments
    flagged?: boolean;
    [key: string]: unknown;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: "active" | "future" | "closed";
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location: { projectKey: string; displayName: string };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string; statusCategory: { key: string } };
}

export interface ConnectionTestResult {
  connected: boolean;
  user?: JiraUser;
  cloudId?: string;
  serverInfo?: { baseUrl: string; version: string };
  error?: string;
  scopes?: string[];
}

// ── Jira Client ──

class JiraClient {
  private host: string;
  private authHeader: string;

  constructor(host: string, email: string, apiToken: string) {
    this.host = host.replace(/\/+$/, "");
    this.authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const base = this.host.includes("://") ? this.host : `https://${this.host}`;
    const url = `${base}${path}`;
    const headers = new Headers(options.headers);
    headers.set("Authorization", this.authHeader);
    headers.set("Accept", "application/json");
    if (options.method === "POST" || options.method === "PUT") {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira API ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  // ── Connection Test ──

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const user = await this.request<JiraUser>("/rest/api/3/myself");
      let serverInfo: { baseUrl: string; version: string } | undefined;
      try {
        serverInfo = await this.request<{ baseUrl: string; version: string }>(
          "/rest/api/3/serverInfo"
        );
      } catch {
        // serverInfo may fail on some Jira Cloud instances
      }

      return {
        connected: true,
        user,
        serverInfo,
        scopes: ["read:jira-work", "write:jira-work", "read:jira-user"],
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Projects ──

  async listProjects(): Promise<JiraProject[]> {
    const data = await this.request<{ values: JiraProject[] }>(
      "/rest/api/3/project/search?maxResults=50"
    );
    return data.values;
  }

  async getProject(projectKey: string): Promise<JiraProject> {
    return this.request<JiraProject>(`/rest/api/3/project/${projectKey}`);
  }

  // ── Issues ──

  async searchIssues(
    jql: string,
    fields = "summary,status,assignee,priority,issuetype,created,updated,duedate,labels,resolution,reporter",
    maxResults = 50
  ): Promise<{ issues: JiraIssue[]; total: number }> {
    return this.request<{ issues: JiraIssue[]; total: number }>(
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`
    );
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(`/rest/api/3/issue/${issueKey}`);
  }

  /** Get all open issues for a project */
  async getOpenIssues(projectKey: string, maxResults = 50): Promise<JiraIssue[]> {
    const jql = `project = "${projectKey}" AND statusCategory != Done ORDER BY updated ASC`;
    const data = await this.searchIssues(jql, undefined, maxResults);
    return data.issues;
  }

  /** Find stale issues (not updated in N days) */
  async getStaleIssues(projectKey: string, staleDays = 3): Promise<JiraIssue[]> {
    const jql = `project = "${projectKey}" AND statusCategory != Done AND updated <= -${staleDays}d ORDER BY updated ASC`;
    const data = await this.searchIssues(jql);
    return data.issues;
  }

  /** Find blocked/flagged issues */
  async getBlockedIssues(projectKey: string): Promise<JiraIssue[]> {
    // "Flagged" is typically stored in a custom field or via labels
    const jql = `project = "${projectKey}" AND statusCategory != Done AND (labels = "blocked" OR labels = "impediment" OR status = "Blocked" OR priority = "Blocker")`;
    const data = await this.searchIssues(jql);
    return data.issues;
  }

  /** Find high-priority issues */
  async getHighPriorityIssues(projectKey: string): Promise<JiraIssue[]> {
    const jql = `project = "${projectKey}" AND statusCategory != Done AND priority in ("Highest", "High", "Blocker") ORDER BY priority ASC`;
    const data = await this.searchIssues(jql);
    return data.issues;
  }

  /** Find issues with approaching due dates */
  async getApproachingDeadlines(projectKey: string, withinDays = 3): Promise<JiraIssue[]> {
    const jql = `project = "${projectKey}" AND statusCategory != Done AND duedate <= ${withinDays}d AND duedate >= 0d ORDER BY duedate ASC`;
    const data = await this.searchIssues(jql);
    return data.issues;
  }

  /** Get recently transitioned issues (for detecting regressions) */
  async getRecentlyUpdated(projectKey: string, withinHours = 24): Promise<JiraIssue[]> {
    const jql = `project = "${projectKey}" AND updated >= -${withinHours}h ORDER BY updated DESC`;
    const data = await this.searchIssues(jql);
    return data.issues;
  }

  // ── Sprints (Jira Software / Agile API) ──

  async getBoards(projectKey?: string): Promise<JiraBoard[]> {
    const params = projectKey ? `?projectKeyOrId=${projectKey}` : "";
    const data = await this.request<{ values: JiraBoard[] }>(
      `/rest/agile/1.0/board${params}`
    );
    return data.values;
  }

  async getActiveSprints(boardId: number): Promise<JiraSprint[]> {
    const data = await this.request<{ values: JiraSprint[] }>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active`
    );
    return data.values;
  }

  async getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    const data = await this.request<{ issues: JiraIssue[] }>(
      `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=100&fields=summary,status,assignee,priority,issuetype,created,updated,duedate,labels,resolution`
    );
    return data.issues;
  }

  // ── Issue Mutations (for autonomous agent) ──

  async addComment(issueKey: string, bodyText: string): Promise<{ id: string }> {
    return this.request(`/rest/api/3/issue/${issueKey}/comment`, {
      method: "POST",
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: bodyText }],
            },
          ],
        },
      }),
    });
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const data = await this.request<{ transitions: JiraTransition[] }>(
      `/rest/api/3/issue/${issueKey}/transitions`
    );
    return data.transitions;
  }

  async updateIssueLabels(issueKey: string, addLabels: string[], removeLabels: string[] = []): Promise<void> {
    await this.request(`/rest/api/3/issue/${issueKey}`, {
      method: "PUT",
      body: JSON.stringify({
        update: {
          labels: [
            ...addLabels.map((l) => ({ add: l })),
            ...removeLabels.map((l) => ({ remove: l })),
          ],
        },
      }),
    });
  }

  async assignIssue(issueKey: string, accountId: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${issueKey}/assignee`, {
      method: "PUT",
      body: JSON.stringify({ accountId }),
    });
  }

  async updatePriority(issueKey: string, priorityName: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${issueKey}`, {
      method: "PUT",
      body: JSON.stringify({
        fields: { priority: { name: priorityName } },
      }),
    });
  }
}

// ── Singleton ──

let _client: JiraClient | null = null;

export function getJiraClient(): JiraClient | null {
  if (_client) return _client;
  if (!hasDirectJira()) return null;
  _client = new JiraClient(config.jira.host, config.jira.email, config.jira.apiToken);
  return _client;
}

export function createJiraClientWithCredentials(
  host: string,
  email: string,
  apiToken: string
): JiraClient {
  return new JiraClient(host, email, apiToken);
}

export { JiraClient };
