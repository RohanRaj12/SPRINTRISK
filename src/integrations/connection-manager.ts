/**
 * Sprint Guardian — Connection Manager
 *
 * Manages real-time connection status for all integrations.
 * Periodically health-checks each service and emits SSE events
 * when connection status changes.
 *
 * Architecture:
 *   - On startup, tests Auth0 M2M connectivity
 *   - Direct PAT checks run as fallback only
 *   - User-specific Token Vault checks run on-demand via checkUserConnections()
 *   - Every 60s, re-tests connections and emits status changes
 */

import { getGitHubClient, type ConnectionTestResult as GitHubConnectionResult } from "./github-client.js";
import { getSlackClient, type ConnectionTestResult as SlackConnectionResult } from "./slack-client.js";
import { getJiraClient, type ConnectionTestResult as JiraConnectionResult } from "./jira-client.js";
import { hasDirectGitHub, hasDirectSlack, hasDirectJira, config } from "../config.js";
import { getUserLinkedServices } from "../services/token-vault.js";
import { emitNotification } from "../routes/events.js";

// ── Types ──

export type IntegrationProvider = "github" | "slack" | "jira" | "auth0";

export interface IntegrationConnectionStatus {
  provider: IntegrationProvider;
  displayName: string;
  description: string;
  status: "connected" | "disconnected" | "checking" | "error" | "not_linked";
  account?: string;
  avatarUrl?: string;
  scopes?: string[];
  lastChecked?: string;
  lastConnected?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  /** How to connect this integration */
  connectInstructions?: string[];
  /** Auth method: "token_vault" | "direct_pat" | "none" */
  authMethod?: string;
}

export interface UserConnectionStatus {
  provider: IntegrationProvider | "github" | "jira" | "slack";
  linked: boolean;
  isFallback: boolean;
  linkUrl?: string;
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
        "1. Click 'Connect GitHub' on the Integrations page",
        "2. Authorize Sprint Guardian via Auth0 OAuth",
        "3. Your GitHub token is securely stored in Auth0 Token Vault",
        "4. (Dev fallback) Set GITHUB_TOKEN in .env for offline development",
      ],
    });

    this.statuses.set("slack", {
      provider: "slack",
      displayName: "Slack",
      description: "Send sprint alerts, DM developers, and monitor team communication.",
      status: "disconnected",
      connectInstructions: [
        "1. Click 'Connect Slack' on the Integrations page",
        "2. Authorize Sprint Guardian via Auth0 OAuth",
        "3. Your Slack token is securely stored in Auth0 Token Vault",
        "4. (Dev fallback) Set SLACK_BOT_TOKEN in .env for offline development",
      ],
    });

    this.statuses.set("jira", {
      provider: "jira",
      displayName: "Jira (Atlassian)",
      description: "Track sprint issues, blockers, SLA violations, and status transitions.",
      status: "disconnected",
      connectInstructions: [
        "1. Click 'Connect Jira' on the Integrations page",
        "2. Authorize Sprint Guardian via Auth0 OAuth (Atlassian)",
        "3. Your Jira token is securely stored in Auth0 Token Vault",
        "4. (Dev fallback) Set JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN in .env",
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

  /**
   * Check which services the current user has linked via Token Vault.
   * Returns per-user status with link URLs for unconnected services.
   */
  async checkUserConnections(userId: string): Promise<UserConnectionStatus[]> {
    const linked = await getUserLinkedServices(userId);
    const services: Array<"github" | "jira" | "slack"> = ["github", "jira", "slack"];

    return services.map((service) => ({
      provider: service,
      linked: linked[service].linked,
      isFallback: linked[service].isFallback,
      linkUrl: linked[service].linked ? undefined : getAuth0LinkUrl(service),
    }));
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
        status.authMethod = "m2m_client_credentials";
        status.metadata = {
          domain: config.auth0.domain,
          audience: config.auth0.audience,
          tokenExpiresIn: data.expires_in,
          tokenVaultEnabled: true,
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
      status.error = "Connect via Auth0 Token Vault or set GITHUB_TOKEN for dev mode";
      status.authMethod = "none";
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
      status.authMethod = "direct_pat";
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
      status.error = "Connect via Auth0 Token Vault or set SLACK_BOT_TOKEN for dev mode";
      status.authMethod = "none";
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
      status.authMethod = "direct_pat";
      status.scopes = [
        "chat:write", "channels:read", "users:read",
        "users:read.email", "im:write", "reactions:write",
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
      status.error = "Connect via Auth0 Token Vault or set JIRA_HOST/EMAIL/API_TOKEN for dev mode";
      status.authMethod = "none";
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
      status.authMethod = "direct_pat";
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
      authMethod: status.authMethod,
      timestamp: status.lastChecked,
    });

    console.log(
      `[ConnectionManager] ${provider}: ${status.status}${status.account ? ` (${status.account})` : ""}${status.authMethod ? ` [${status.authMethod}]` : ""}${status.error ? ` — ${status.error}` : ""}`
    );
  }
}

// ── Auth0 Account Linking Helper ──

/**
 * Generate an Auth0 authorize URL for linking a new social/enterprise identity.
 * Uses the "silent re-authorize" pattern (Option A):
 * After initial login, redirect to Auth0 with connection= to link the IdP.
 */
export function getAuth0LinkUrl(
  service: "github" | "jira" | "slack",
  redirectUri?: string
): string {
  const connectionMap: Record<string, string> = {
    github: config.connections.github,
    jira: config.connections.jira,
    slack: config.connections.slack,
  };

  const connection = connectionMap[service];
  const redirect = redirectUri ?? "http://localhost:3000/integrations";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.auth0.frontendClientId,
    redirect_uri: redirect,
    connection,
    scope: "openid profile email",
    audience: config.auth0.audience,
  });

  return `https://${config.auth0.domain}/authorize?${params}`;
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
