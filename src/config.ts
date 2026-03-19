import "dotenv/config";

export const config = {
  // ── Auth0 ──
  auth0: {
    domain: requiredEnv("AUTH0_DOMAIN"),
    audience: requiredEnv("AUTH0_AUDIENCE"),
    m2mClientId: requiredEnv("AUTH0_M2M_CLIENT_ID"),
    m2mClientSecret: requiredEnv("AUTH0_M2M_CLIENT_SECRET"),
  },

  // ── Token Vault connection identifiers ──
  connections: {
    jira: process.env.JIRA_CONNECTION_NAME ?? "Atlassian",
    github: process.env.GITHUB_CONNECTION_NAME ?? "github",
    slack: process.env.SLACK_CONNECTION_NAME ?? "slack",
  },

  // ── Google Gemini ──
  gemini: {
    apiKey: requiredEnv("GEMINI_API_KEY"),
  },

  // ── Server ──
  server: {
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "0.0.0.0",
  },

  // ── Scheduler ──
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED === "true",
    cron: process.env.SCHEDULER_CRON ?? "0 9 * * 1-5", // weekdays at 9 AM
    auditUserId: process.env.SCHEDULER_AUDIT_USER_ID ?? "", // Auth0 user ID for delegation
    jiraSite: process.env.SCHEDULER_JIRA_SITE ?? "",
    jiraProjectKey: process.env.SCHEDULER_JIRA_PROJECT ?? "",
    githubOwner: process.env.SCHEDULER_GITHUB_OWNER ?? "",
    githubRepo: process.env.SCHEDULER_GITHUB_REPO ?? "",
    slackChannel: process.env.SCHEDULER_SLACK_CHANNEL ?? "#engineering",
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
