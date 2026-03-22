/**
 * Sprint Guardian — Demo Data: Integration Status
 */

import type { IntegrationStatus } from "../data-source.js";

export const DEMO_INTEGRATIONS: IntegrationStatus[] = [
  {
    provider: "jira",
    displayName: "Jira (Atlassian)",
    description:
      "Query sprint tickets, identify stale issues, and track assignment patterns across your Jira projects.",
    status: "connected",
    account: "alex@acme.atlassian.net",
    lastSync: new Date(Date.now() - 15 * 60000).toISOString(),
    scopes: ["read:jira-work", "read:jira-user", "read:sprint:jira-software"],
  },
  {
    provider: "github",
    displayName: "GitHub",
    description:
      "Monitor pull requests, CI/CD pipeline status, review bottlenecks, and merge readiness across repositories.",
    status: "connected",
    account: "acme-corp",
    lastSync: new Date(Date.now() - 8 * 60000).toISOString(),
    scopes: ["repo:read", "checks:read", "pull_requests:read"],
  },
  {
    provider: "slack",
    displayName: "Slack",
    description:
      "Send sprint health notifications, DM developers about stale work, and post summaries to channels.",
    status: "disconnected",
    error: "Not connected — click Connect to authorize via Auth0 Token Vault.",
  },
];
