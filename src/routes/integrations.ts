/**
 * Sprint Guardian — Integration Routes
 *
 * Endpoints for managing and checking integration status.
 *
 * Endpoints:
 * - GET /api/integrations/status — Check connection status for all services
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getDelegatedToken } from "../services/token-vault.js";

interface IntegrationStatus {
  provider: string;
  displayName: string;
  status: "connected" | "disconnected" | "error";
  lastChecked: string;
  error?: string;
}

export async function integrationRoutes(fastify: FastifyInstance) {
  // ── GET /api/integrations/status ──
  fastify.get("/api/integrations/status", async (request: FastifyRequest) => {
    const user = request.user as Record<string, unknown>;
    const userId = user.sub as string;

    const providers = [
      { name: "jira" as const, displayName: "Jira (Atlassian)" },
      { name: "github" as const, displayName: "GitHub" },
      { name: "slack" as const, displayName: "Slack" },
    ];

    const statuses: IntegrationStatus[] = await Promise.all(
      providers.map(async (provider) => {
        try {
          await getDelegatedToken(userId, provider.name);
          return {
            provider: provider.name,
            displayName: provider.displayName,
            status: "connected" as const,
            lastChecked: new Date().toISOString(),
          };
        } catch (err) {
          return {
            provider: provider.name,
            displayName: provider.displayName,
            status: "disconnected" as const,
            lastChecked: new Date().toISOString(),
            error:
              err instanceof Error ? err.message : "Unknown error",
          };
        }
      })
    );

    return { integrations: statuses };
  });
}
