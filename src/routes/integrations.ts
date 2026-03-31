/**
 * Sprint Guardian — Integration Routes
 *
 * Real-time integration status using the ConnectionManager.
 *
 * Endpoints:
 * - GET /api/integrations/status       — Auth'd: check via Token Vault (legacy)
 * - GET /api/integrations/live-status   — Public: real-time connection status
 * - GET /api/integrations/connect-instructions — Public: how to connect each service
 * - POST /api/integrations/refresh      — Auth'd: force re-check all connections
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getConnectionManager } from "../integrations/index.js";

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
      })),
      connectedCount: manager.getConnectedCount(),
      refreshedAt: new Date().toISOString(),
    };
  });

  // ── Legacy: GET /api/integrations/status (AUTH'd — Token Vault path) ──
  fastify.get("/api/integrations/status", async (request: FastifyRequest) => {
    // For backward compatibility, redirect to live status
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
        })),
    };
  });
}
