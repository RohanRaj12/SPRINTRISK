/**
 * Sprint Guardian — Connection Manager
 *
 * Manages real-time connection status for all integrations.
 * Periodically health-checks each service and emits SSE events
 * when connection status changes.
 *
 * Architecture:
 *   - On startup, tests all configured integrations
 *   - Every 60s, re-tests connections and emits status changes
 *   - Provides API for querying current status
 *   - Caches connection metadata (user info, scopes, etc.)
 */

import { getGitHubClient, type ConnectionTestResult as GitHubConnectionResult } from "./github-client.js";
import { getSlackClient, type ConnectionTestResult as SlackConnectionResult } from "./slack-client.js";
import { getJiraClient, type ConnectionTestResult as JiraConnectionResult } from "./jira-client.js";
import { hasDirectGitHub, hasDirectSlack, hasDirectJira, config } from "../config.js";
import { emitNotification } from "../routes/events.js";

// ── Types ──

export type IntegrationProvider = "github" | "slack" | "jira" | "auth0";

export interface IntegrationConnectionStatus {
  provider: IntegrationProvider;
  displayName: string;
  description: string;
  status: "connected" | "disconnected" | "checking" | "error";
  account?: string;
  avatarUrl?: string;
  scopes?: string[];
  lastChecked?: string;
  lastConnected?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  /** How to connect this integration */
  connectInstructions?: string[];
}

// ── Connection Manager ──

class ConnectionManager {
  private statuses = new Map<IntegrationProvider, IntegrationConnectionStatus>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Initialize all integrations as disconnected
    this.statuses.set("auth0", {
      provider: "auth0",
      displayName: "Auth0 by Okta",
      description: "Identity & access management — JWT auth, Token Vault, M2M tokens for secure API access.",
      status: "disconnected",
      connectInstructions: [
        "1. Create an Auth0 tenant at https://auth0.com",
        "2. Create an API with identifier matching AUTH0_AUDIENCE",
        "3. Create an M2M application and authorize it for the Management API",
        "4. Set AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_M2M_CLIENT_ID, AUTH0_M2M_CLIENT_SECRET in .env",
      ],
    });

    this.statuses.set("github", {
      provider: "github",
      displayName: "GitHub",
      description: "Monitor PRs, CI/CD status, commits, issues, and review bottlenecks.",
      status: "disconnected",
      connectInstructions: [
        "1. Go to https://github.com/settings/tokens",
        "2. Generate a Fine-grained PAT with these permissions:",
        "   - Repository access: Select your repos",
        "   - Permissions: Contents (read), Issues (read/write), Pull requests (read/write), Checks (read)",
        "3. Set GITHUB_TOKEN in .env",
        "4. Set GITHUB_DEFAULT_OWNER and GITHUB_DEFAULT_REPO for your target repo",
        "5. (Optional) Set GITHUB_WEBHOOK_SECRET and configure webhook at your repo Settings > Webhooks",
      ],
    });

    this.statuses.set("slack", {
      provider: "slack",
      displayName: "Slack",
      description: "Send sprint alerts, DM developers, and monitor team communication.",
      status: "disconnected",
      connectInstructions: [
        "1. Go to https://api.slack.com/apps and create a new app",
        "2. Under OAuth & Permissions, add Bot Token Scopes:",
        "   chat:write, channels:read, users:read, users:read.email, im:write, reactions:write",
        "3. Install the app to your workspace",
        "4. Copy the Bot User OAuth Token (xoxb-...)",
        "5. Set SLACK_BOT_TOKEN in .env",
        "6. Set SLACK_DEFAULT_CHANNEL (e.g., #engineering)",
        "7. (Optional) Set SLACK_SIGNING_SECRET for webhook verification",
      ],
    });

    this.statuses.set("jira", {
      provider: "jira",
      displayName: "Jira (Atlassian)",
      description: "Track sprint issues, blockers, SLA violations, and status transitions.",
      status: "disconnected",
      connectInstructions: [
        "1. Go to https://id.atlassian.com/manage-profile/security/api-tokens",
        "2. Create an API token",
        "3. Set JIRA_HOST (e.g., mycompany.atlassian.net) in .env",
        "4. Set JIRA_EMAIL (your Atlassian account email)",
        "5. Set JIRA_API_TOKEN (the token you created)",
        "6. Set JIRA_DEFAULT_PROJECT (e.g., ENG)",
        "7. (Optional) Configure a webhook in Jira: Project Settings > Webhooks, point to /api/webhooks/jira",
      ],
    });
  }

  /** Test all configured integrations and update statuses */
  async checkAll(): Promise<void> {
    await Promise.allSettled([
      this.checkAuth0(),
      this.checkGitHub(),
      this.checkSlack(),
      this.checkJira(),
    ]);
  }

  /** Start periodic health checking (every 60s) */
  startPolling(intervalMs = 60_000): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => this.checkAll(), intervalMs);
    // Initial check
    this.checkAll();
  }

  /** Stop polling */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /** Get status for all integrations */
  getAllStatuses(): IntegrationConnectionStatus[] {
    return Array.from(this.statuses.values());
  }

  /** Get status for a specific integration */
  getStatus(provider: IntegrationProvider): IntegrationConnectionStatus | undefined {
    return this.statuses.get(provider);
  }

  /** Get count of connected integrations */
  getConnectedCount(): number {
    return Array.from(this.statuses.values()).filter((s) => s.status === "connected").length;
  }

  // ── Individual Checks ──

  private async checkAuth0(): Promise<void> {
    const status = this.statuses.get("auth0")!;
    const previousStatus = status.status;

    try {
      // Test M2M token acquisition
      const response = await fetch(`https://${config.auth0.domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: config.auth0.m2mClientId,
          client_secret: config.auth0.m2mClientSecret,
          audience: `https://${config.auth0.domain}/api/v2/`,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { access_token: string; expires_in: number };
        status.status = "connected";
        status.account = config.auth0.domain;
        status.lastChecked = new Date().toISOString();
        status.lastConnected = new Date().toISOString();
        status.scopes = ["openid", "profile", "email", "read:users", "read:user_idp_tokens"];
        status.error = undefined;
        status.metadata = {
          domain: config.auth0.domain,
          audience: config.auth0.audience,
          tokenExpiresIn: data.expires_in,
        };
      } else {
        const body = await response.text();
        status.status = "error";
        status.error = `Auth0 M2M token failed: ${response.status} ${body}`;
        status.lastChecked = new Date().toISOString();
      }
    } catch (err) {
      status.status = "error";
      status.error = err instanceof Error ? err.message : String(err);
      status.lastChecked = new Date().toISOString();
    }

    if (previousStatus !== status.status) {
      this.emitStatusChange("auth0", status);
    }
  }

  private async checkGitHub(): Promise<void> {
    const status = this.statuses.get("github")!;
    const previousStatus = status.status;

    if (!hasDirectGitHub()) {
      status.status = "disconnected";
      status.lastChecked = new Date().toISOString();
      status.error = "GITHUB_TOKEN not configured";
      return;
    }

    const client = getGitHubClient();
    if (!client) return;

    const result = await client.testConnection();

    if (result.connected && result.user) {
      status.status = "connected";
      status.account = result.user.login;
      status.avatarUrl = result.user.avatar_url;
      status.scopes = result.scopes;
      status.lastChecked = new Date().toISOString();
      status.lastConnected = new Date().toISOString();
      status.error = undefined;
      status.metadata = {
        userId: result.user.id,
        name: result.user.name,
        profileUrl: result.user.html_url,
        rateLimit: result.rateLimit,
        defaultRepo: config.github.defaultOwner && config.github.defaultRepo
          ? `${config.github.defaultOwner}/${config.github.defaultRepo}`
          : undefined,
        webhookConfigured: !!config.github.webhookSecret,
      };
    } else {
      status.status = "error";
      status.error = result.error;
      status.lastChecked = new Date().toISOString();
    }

    if (previousStatus !== status.status) {
      this.emitStatusChange("github", status);
    }
  }

  private async checkSlack(): Promise<void> {
    const status = this.statuses.get("slack")!;
    const previousStatus = status.status;

    if (!hasDirectSlack()) {
      status.status = "disconnected";
      status.lastChecked = new Date().toISOString();
      status.error = "SLACK_BOT_TOKEN not configured";
      return;
    }

    const client = getSlackClient();
    if (!client) return;

    const result = await client.testConnection();

    if (result.connected) {
      status.status = "connected";
      status.account = `${result.team} (${result.botUser})`;
      status.lastChecked = new Date().toISOString();
      status.lastConnected = new Date().toISOString();
      status.error = undefined;
      status.scopes = [
        "chat:write",
        "channels:read",
        "users:read",
        "users:read.email",
        "im:write",
        "reactions:write",
      ];
      status.metadata = {
        team: result.team,
        teamId: result.teamId,
        botUser: result.botUser,
        defaultChannel: config.slack.defaultChannel || undefined,
        signingSecretConfigured: !!config.slack.signingSecret,
      };
    } else {
      status.status = "error";
      status.error = result.error;
      status.lastChecked = new Date().toISOString();
    }

    if (previousStatus !== status.status) {
      this.emitStatusChange("slack", status);
    }
  }

  private async checkJira(): Promise<void> {
    const status = this.statuses.get("jira")!;
    const previousStatus = status.status;

    if (!hasDirectJira()) {
      status.status = "disconnected";
      status.lastChecked = new Date().toISOString();
      status.error = "JIRA_HOST, JIRA_EMAIL, or JIRA_API_TOKEN not configured";
      return;
    }

    const client = getJiraClient();
    if (!client) return;

    const result = await client.testConnection();

    if (result.connected && result.user) {
      status.status = "connected";
      status.account = `${result.user.displayName} (${config.jira.host})`;
      status.avatarUrl = result.user.avatarUrls?.["48x48"];
      status.lastChecked = new Date().toISOString();
      status.lastConnected = new Date().toISOString();
      status.error = undefined;
      status.scopes = result.scopes;
      status.metadata = {
        accountId: result.user.accountId,
        displayName: result.user.displayName,
        email: result.user.emailAddress,
        host: config.jira.host,
        defaultProject: config.jira.defaultProject || undefined,
        serverVersion: result.serverInfo?.version,
      };
    } else {
      status.status = "error";
      status.error = result.error;
      status.lastChecked = new Date().toISOString();
    }

    if (previousStatus !== status.status) {
      this.emitStatusChange("jira", status);
    }
  }

  // ── Event Emission ──

  private emitStatusChange(
    provider: IntegrationProvider,
    status: IntegrationConnectionStatus
  ): void {
    emitNotification("integration_change", {
      provider,
      status: status.status,
      account: status.account,
      timestamp: status.lastChecked,
    });

    console.log(
      `[ConnectionManager] ${provider}: ${status.status}${status.account ? ` (${status.account})` : ""}${status.error ? ` — ${status.error}` : ""}`
    );
  }
}

// ── Singleton ──

let _manager: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!_manager) {
    _manager = new ConnectionManager();
  }
  return _manager;
}

export { ConnectionManager };
