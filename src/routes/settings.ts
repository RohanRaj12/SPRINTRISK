/**
 * Sprint Guardian — Settings API Routes
 *
 * Manages organization-level configuration: service connections,
 * notification preferences, and integration targets.
 */

import type { FastifyInstance } from "fastify";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { realSource } from "../data/data-source-manager.js";

// ── Persistent config store (saved to file) ──

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
const CONFIG_DIR = join(process.cwd(), "config");
const CONFIG_FILE = join(CONFIG_DIR, "org_settings.json");

// Load from disk on module init
function initializeStore() {
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const data = JSON.parse(raw) as Record<string, OrgConfig>;
      for (const [id, cfg] of Object.entries(data)) {
        configStore.set(id, cfg);
      }
      console.info(`[Settings] Loaded configuration for ${configStore.size} orgs`);
    } catch (err) {
      console.error("[Settings] Failed to load config file:", err);
    }
  }
}

function persistStore() {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR);
    const data = Object.fromEntries(configStore.entries());
    writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Settings] Failed to save config file:", err);
  }
}

initializeStore();

export function getOrgConfig(orgId: string): OrgConfig {
  return configStore.get(orgId) ?? { ...DEFAULT_CONFIG };
}

export async function settingsRoutes(fastify: FastifyInstance) {
  // ── Get config ──
  fastify.get("/api/settings/config", async (request) => {
    const user = request.user as Record<string, unknown> | undefined;
    const orgId = (user?.org_id as string) ?? "default";
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
      const user = request.user as Record<string, unknown> | undefined;
      const orgId = (user?.org_id as string) ?? "default";
      const existing = getOrgConfig(orgId);
      const updated: OrgConfig = {
        jira: { ...existing.jira, ...(request.body.jira ?? {}) },
        github: { ...existing.github, ...(request.body.github ?? {}) },
        slack: { ...existing.slack, ...(request.body.slack ?? {}) },
        notifications: { ...existing.notifications, ...(request.body.notifications ?? {}) },
      };
      configStore.set(orgId, updated);
      persistStore();

      // IMPORTANT: Clear the data cache for this user so they see their changes immediately
      const userId = (user?.sub as string) || "system";
      realSource.clearCache(userId);

      request.log.info({ orgId, userId }, "Config saved and cache reset");
      return { config: updated };
    }
  );
}
