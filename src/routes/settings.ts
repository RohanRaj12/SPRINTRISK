/**
 * Sprint Guardian — Settings API Routes
 *
 * Manages organization-level configuration: service connections,
 * notification preferences, and integration targets.
 */

import type { FastifyInstance } from "fastify";

// ── In-memory config store (replace with DB in production) ──

export interface OrgConfig {
  jira: { site: string; projectKey: string; boardName: string; staleThresholdDays: number };
  github: { owner: string; repo: string; branch: string };
  slack: { channel: string; alertSeverity: string; enabled: boolean };
  notifications: { staleTickets: boolean; ciFailures: boolean; prReminders: boolean; escalations: boolean };
}

const DEFAULT_CONFIG: OrgConfig = {
  jira: { site: "", projectKey: "", boardName: "", staleThresholdDays: 3 },
  github: { owner: "", repo: "", branch: "main" },
  slack: { channel: "#engineering", alertSeverity: "medium", enabled: true },
  notifications: { staleTickets: true, ciFailures: true, prReminders: true, escalations: true },
};

const configStore = new Map<string, OrgConfig>();

export function getOrgConfig(orgId: string): OrgConfig {
  return configStore.get(orgId) ?? { ...DEFAULT_CONFIG };
}

export async function settingsRoutes(fastify: FastifyInstance) {
  // ── Get config ──
  fastify.get("/api/settings/config", async (request) => {
    const user = request.user as Record<string, unknown>;
    const orgId = (user.org_id as string) ?? "default";
    return { config: getOrgConfig(orgId) };
  });

  // ── Save config ──
  fastify.post<{ Body: Partial<OrgConfig> }>(
    "/api/settings/config",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            jira: { type: "object" },
            github: { type: "object" },
            slack: { type: "object" },
            notifications: { type: "object" },
          },
        },
      },
    },
    async (request) => {
      const user = request.user as Record<string, unknown>;
      const orgId = (user.org_id as string) ?? "default";
      const existing = getOrgConfig(orgId);
      const updated: OrgConfig = {
        jira: { ...existing.jira, ...(request.body.jira ?? {}) },
        github: { ...existing.github, ...(request.body.github ?? {}) },
        slack: { ...existing.slack, ...(request.body.slack ?? {}) },
        notifications: { ...existing.notifications, ...(request.body.notifications ?? {}) },
      };
      configStore.set(orgId, updated);
      request.log.info({ orgId }, "Config saved");
      return { config: updated };
    }
  );
}
