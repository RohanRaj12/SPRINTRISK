/**
 * Sprint Guardian — GitHub Integration Client
 *
 * Production GitHub REST API client supporting two auth modes:
 *   1. Direct PAT (GITHUB_TOKEN env var) — for hackathon/demo
 *   2. Auth0 Token Vault delegated tokens — for enterprise
 *
 * Monitors: repos, PRs, commits, CI status, issues, reviews
 * Webhook events: push, pull_request, check_run, check_suite, issues
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { config, hasDirectGitHub } from "../config.js";

const GITHUB_API = "https://api.github.com";

// ── Types ──

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  email: string | null;
  html_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  default_branch: string;
  open_issues_count: number;
  updated_at: string;
  language: string | null;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  user: { login: string; avatar_url: string };
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  draft: boolean;
  html_url: string;
  head: { sha: string; ref: string };
  base: { ref: string };
  requested_reviewers: Array<{ login: string }>;
  labels: Array<{ name: string; color: string }>;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string | null;
  html_url: string;
  app: { name: string };
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
  html_url: string;
  author: { login: string } | null;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  user: { login: string };
  assignees: Array<{ login: string }>;
  labels: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface ConnectionTestResult {
  connected: boolean;
  user?: GitHubUser;
  error?: string;
  scopes?: string[];
  rateLimit?: { remaining: number; limit: number; reset: string };
}

// ── GitHub Client ──

class GitHubClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", "2022-11-28");

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  private async requestWithHeaders<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<{ data: T; headers: Headers }> {
    const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", "2022-11-28");

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status}: ${body}`);
    }

    const data = (await response.json()) as T;
    return { data, headers: response.headers };
  }

  // ── Connection Test ──

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const { data: user, headers } = await this.requestWithHeaders<GitHubUser>("/user");
      const scopes = headers.get("x-oauth-scopes")?.split(",").map((s) => s.trim()) ?? [];
      const rateLimit = {
        remaining: Number(headers.get("x-ratelimit-remaining") ?? 0),
        limit: Number(headers.get("x-ratelimit-limit") ?? 0),
        reset: new Date(Number(headers.get("x-ratelimit-reset") ?? 0) * 1000).toISOString(),
      };

      return { connected: true, user, scopes, rateLimit };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── User & Repos ──

  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this.request<GitHubUser>("/user");
  }

  async listRepos(perPage = 10): Promise<GitHubRepo[]> {
    return this.request<GitHubRepo[]>(`/user/repos?per_page=${perPage}&sort=updated&direction=desc`);
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`);
  }

  // ── Pull Requests ──

  async listPullRequests(owner: string, repo: string, state = "open", perPage = 30): Promise<GitHubPR[]> {
    return this.request<GitHubPR[]>(
      `/repos/${owner}/${repo}/pulls?state=${state}&sort=created&direction=desc&per_page=${perPage}`
    );
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPR> {
    return this.request<GitHubPR>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async listPRReviews(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Array<{ user: { login: string }; state: string; submitted_at: string }>> {
    return this.request(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`);
  }

  // ── CI/CD Status ──

  async getCheckRuns(owner: string, repo: string, ref: string): Promise<GitHubCheckRun[]> {
    const data = await this.request<{ check_runs: GitHubCheckRun[] }>(
      `/repos/${owner}/${repo}/commits/${ref}/check-runs`
    );
    return data.check_runs;
  }

  async getCombinedStatus(
    owner: string,
    repo: string,
    ref: string
  ): Promise<{ state: string; statuses: Array<{ context: string; state: string }> }> {
    return this.request(`/repos/${owner}/${repo}/commits/${ref}/status`);
  }

  // ── Commits ──

  async listCommits(owner: string, repo: string, perPage = 10): Promise<GitHubCommit[]> {
    return this.request<GitHubCommit[]>(
      `/repos/${owner}/${repo}/commits?per_page=${perPage}`
    );
  }

  // ── Issues ──

  async listIssues(owner: string, repo: string, state = "open", perPage = 30): Promise<GitHubIssue[]> {
    return this.request<GitHubIssue[]>(
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}&sort=updated&direction=desc`
    );
  }

  // ── Comments (for autonomous agent actions) ──

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<{ id: number; html_url: string }> {
    return this.request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
  }

  async createPRReviewComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<{ id: number; html_url: string }> {
    return this.request(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, event: "COMMENT" }),
    });
  }

  // ── Labels ──

  async addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ): Promise<Array<{ name: string }>> {
    return this.request(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels }),
    });
  }
}

// ── Webhook Signature Verification ──

export function verifyGitHubWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  if (!secret || !signature) return false;

  const sig = Buffer.from(signature);
  const hmac = createHmac("sha256", secret);
  const digest = Buffer.from("sha256=" + hmac.update(payload).digest("hex"));

  if (sig.length !== digest.length) return false;
  return timingSafeEqual(digest, sig);
}

// ── Singleton ──

let _client: GitHubClient | null = null;

export function getGitHubClient(): GitHubClient | null {
  if (_client) return _client;
  if (!hasDirectGitHub()) return null;
  _client = new GitHubClient(config.github.token);
  return _client;
}

export function createGitHubClientWithToken(token: string): GitHubClient {
  return new GitHubClient(token);
}

export { GitHubClient };
