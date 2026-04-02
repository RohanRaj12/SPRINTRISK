/**
 * Sprint Guardian — Integration Routes
 *
 * Real-time integration status using the ConnectionManager.
 *
 * Endpoints:
 * - GET  /api/integrations/live-status          — Public: real-time connection status
 * - GET  /api/integrations/connect-instructions  — Public: how to connect each service
 * - POST /api/integrations/user-status           — Auth'd: per-user Token Vault status
 * - GET  /api/integrations/link-url/:service     — Auth'd: get Auth0 OAuth link URL
 * - POST /api/integrations/refresh               — Auth'd: force re-check all connections
 * - GET  /api/integrations/status                — Auth'd: legacy status endpoint
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getConnectionManager, getAuth0LinkUrl } from "../integrations/index.js";
import { config } from "../config.js";

export async function integrationRoutes(fastify: FastifyInstance) {
  // ── GET /api/integrations/live-status (PUBLIC — no auth required) ──
  fastify.get("/api/integrations/live-status", async () => {
    const manager = getConnectionManager();
    const statuses = manager.getAllStatuses();

    return {
      integrations: statuses.map((s) => ({
        provider: s.provider,
        displayName: s.displayName,
        description: s.description,
        status: s.status,
        account: s.account,
        avatarUrl: s.avatarUrl,
        scopes: s.scopes,
        lastChecked: s.lastChecked,
        lastConnected: s.lastConnected,
        error: s.error,
        metadata: s.metadata,
        authMethod: s.authMethod,
      })),
      connectedCount: manager.getConnectedCount(),
      totalCount: statuses.length,
      timestamp: new Date().toISOString(),
    };
  });

  // ── GET /api/integrations/connect-instructions (PUBLIC) ──
  fastify.get("/api/integrations/connect-instructions", async () => {
    const manager = getConnectionManager();
    const statuses = manager.getAllStatuses();

    return {
      integrations: statuses.map((s) => ({
        provider: s.provider,
        displayName: s.displayName,
        status: s.status,
        connectInstructions: s.connectInstructions,
      })),
    };
  });

  // ── POST /api/integrations/user-status (AUTH'd — Token Vault check) ──
  // Returns which services the current user has linked via Auth0
  fastify.post("/api/integrations/user-status", async (request: FastifyRequest) => {
    const user = request.user as Record<string, unknown>;
    const userId = user?.sub as string;

    if (!userId) {
      return { error: "User ID not found in token", services: [] };
    }

    const manager = getConnectionManager();
    const userServices = await manager.checkUserConnections(userId);

    return {
      userId,
      services: userServices.map((s) => ({
        provider: s.provider,
        linked: s.linked,
        isFallback: s.isFallback,
        linkUrl: s.linkUrl,
        displayName: {
          github: "GitHub",
          jira: "Jira (Atlassian)",
          slack: "Slack",
        }[s.provider as string] ?? s.provider,
      })),
      allLinked: userServices.every((s) => s.linked),
      timestamp: new Date().toISOString(),
    };
  });

  // ── GET /api/integrations/link-url/:service (AUTH'd) ──
  // Returns the Auth0 authorize URL for OAuth account linking
  fastify.get<{ Params: { service: string } }>(
    "/api/integrations/link-url/:service",
    async (request, reply) => {
      const { service } = request.params;

      if (!["github", "jira", "slack"].includes(service)) {
        return reply.status(400).send({
          error: `Invalid service: ${service}. Must be github, jira, or slack.`,
        });
      }

      const redirectUri = request.headers.referer
        ? new URL(request.headers.referer).origin + "/integrations"
        : "http://localhost:3000/integrations";

      const linkUrl = getAuth0LinkUrl(
        service as "github" | "jira" | "slack",
        redirectUri
      );

      return {
        service,
        linkUrl,
        connection: config.connections[service as keyof typeof config.connections],
        instructions: [
          `1. User will be redirected to Auth0 at ${config.auth0.domain}`,
          `2. Auth0 will forward to the ${service} OAuth consent screen`,
          `3. After consent, token is stored in Auth0 Token Vault`,
          `4. User is redirected back to ${redirectUri}`,
          `5. No PAT or API token is stored in the application`,
        ],
      };
    }
  );

  // ── POST /api/integrations/refresh (AUTH'd) ──
  fastify.post("/api/integrations/refresh", async (request: FastifyRequest) => {
    const manager = getConnectionManager();
    await manager.checkAll();
    const statuses = manager.getAllStatuses();

    return {
      integrations: statuses.map((s) => ({
        provider: s.provider,
        displayName: s.displayName,
        status: s.status,
        account: s.account,
        avatarUrl: s.avatarUrl,
        scopes: s.scopes,
        lastChecked: s.lastChecked,
        error: s.error,
        metadata: s.metadata,
        authMethod: s.authMethod,
      })),
      connectedCount: manager.getConnectedCount(),
      refreshedAt: new Date().toISOString(),
    };
  });

  // ── Legacy: GET /api/integrations/status (AUTH'd) ──
  fastify.get("/api/integrations/status", async (request: FastifyRequest) => {
    const manager = getConnectionManager();
    const statuses = manager.getAllStatuses();

    return {
      integrations: statuses
        .filter((s) => s.provider !== "auth0")
        .map((s) => ({
          provider: s.provider,
          displayName: s.displayName,
          status: s.status,
          lastChecked: s.lastChecked,
          error: s.error,
          authMethod: s.authMethod,
        })),
    };
  });
}
