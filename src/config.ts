import "dotenv/config";

export const config = {
  // ── Auth0 by Okta (Core Identity Layer — ONLY required credentials) ──
  auth0: {
    domain: requiredEnv("AUTH0_DOMAIN"),
    audience: requiredEnv("AUTH0_AUDIENCE"),
    m2mClientId: requiredEnv("AUTH0_M2M_CLIENT_ID"),
    m2mClientSecret: requiredEnv("AUTH0_M2M_CLIENT_SECRET"),
    frontendClientId: requiredEnv("AUTH0_FRONTEND_CLIENT_ID"),
  },

  // ── Token Vault connection names (must match Auth0 dashboard) ──
  connections: {
    jira: process.env.JIRA_CONNECTION_NAME ?? "Atlassian",
    github: process.env.GITHUB_CONNECTION_NAME ?? "github",
    slack: process.env.SLACK_CONNECTION_NAME ?? "slack",
  },

  // ── GitHub (optional direct fallback — Token Vault is primary) ──
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
    defaultOwner: process.env.GITHUB_DEFAULT_OWNER ?? "",
    defaultRepo: process.env.GITHUB_DEFAULT_REPO ?? "",
  },

  // ── Slack (optional direct fallback — Token Vault is primary) ──
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN ?? "",
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
    defaultChannel: process.env.SLACK_DEFAULT_CHANNEL ?? "",
    appId: process.env.SLACK_APP_ID ?? "",
  },

  // ── Jira (optional direct fallback — Token Vault is primary) ──
  jira: {
    host: process.env.JIRA_HOST ?? "",
    email: process.env.JIRA_EMAIL ?? "",
    apiToken: process.env.JIRA_API_TOKEN ?? "",
    defaultProject: process.env.JIRA_DEFAULT_PROJECT ?? "",
  },

  // ── AI Provider ──
  ai: {
    provider: (process.env.AI_PROVIDER ?? "groq") as "groq" | "gemini",
    groqApiKey: process.env.GROQ_API_KEY ?? "",
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  },

  // ── Server ──
  server: {
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "0.0.0.0",
  },
} as const;

// ── Helpers ──

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Check whether a direct (PAT-based) integration has enough config.
 * These are FALLBACKS — Token Vault via Auth0 is the primary auth path.
 */
export function hasDirectGitHub(): boolean {
  return !!config.github.token;
}

export function hasDirectSlack(): boolean {
  return !!config.slack.botToken;
}

export function hasDirectJira(): boolean {
  return !!(config.jira.host && config.jira.email && config.jira.apiToken);
}

/**
 * Get a direct fallback token for a service (dev mode only).
 * Returns null if not configured — caller should use Token Vault instead.
 */
export function getDirectFallbackToken(service: "github" | "jira" | "slack"): string | null {
  switch (service) {
    case "github":
      return config.github.token || null;
    case "slack":
      return config.slack.botToken || null;
    case "jira":
      // Jira uses basic auth email:token, return as base64
      if (config.jira.email && config.jira.apiToken) {
        return Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString("base64");
      }
      return null;
    default:
      return null;
  }
}
