import "dotenv/config";

export const config = {
  // ── Auth0 by Okta (Core Identity Layer) ──
  auth0: {
    domain: requiredEnv("AUTH0_DOMAIN"),
    audience: requiredEnv("AUTH0_AUDIENCE"),
    m2mClientId: requiredEnv("AUTH0_M2M_CLIENT_ID"),
    m2mClientSecret: requiredEnv("AUTH0_M2M_CLIENT_SECRET"),
  },

  // ── Token Vault connection identifiers (enterprise path) ──
  connections: {
    jira: process.env.JIRA_CONNECTION_NAME ?? "Atlassian",
    github: process.env.GITHUB_CONNECTION_NAME ?? "github",
    slack: process.env.SLACK_CONNECTION_NAME ?? "slack",
  },

  // ── GitHub Direct Integration ──
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
    defaultOwner: process.env.GITHUB_DEFAULT_OWNER ?? "",
    defaultRepo: process.env.GITHUB_DEFAULT_REPO ?? "",
  },

  // ── Slack Direct Integration ──
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN ?? "",
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
    defaultChannel: process.env.SLACK_DEFAULT_CHANNEL ?? "",
    appId: process.env.SLACK_APP_ID ?? "",
  },

  // ── Jira Direct Integration ──
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

/** Check whether a direct integration has enough config to attempt connection */
export function hasDirectGitHub(): boolean {
  return !!config.github.token;
}

export function hasDirectSlack(): boolean {
  return !!config.slack.botToken;
}

export function hasDirectJira(): boolean {
  return !!(config.jira.host && config.jira.email && config.jira.apiToken);
}
