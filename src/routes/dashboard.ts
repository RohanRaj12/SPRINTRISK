/**
 * Sprint Guardian — Dashboard API Routes
 *
 * Serves dashboard data through the DataSource abstraction.
 * Every response includes a `source` field ("live" | "demo").
 */

import type { FastifyInstance } from "fastify";
import { getDataSource, isDemoMode, wrapResponse } from "../data/index.js";

export async function dashboardRoutes(fastify: FastifyInstance) {
  // ── Sprint Issues ──
  fastify.get("/api/dashboard/issues", async (request) => {
    const user = request.user as Record<string, unknown>;
    const userId = user.sub as string;
    const demo = isDemoMode();
    const ds = getDataSource(demo);
    const data = await ds.getSprintIssues(userId);
    return wrapResponse(data, ds.source);
  });

  // ── GitHub PRs ──
  fastify.get("/api/dashboard/prs", async (request) => {
    const user = request.user as Record<string, unknown>;
    const userId = user.sub as string;
    const demo = isDemoMode();
    const ds = getDataSource(demo);
    const data = await ds.getGithubPRs(userId);
    return wrapResponse(data, ds.source);
  });

  // ── Approvals ──
  fastify.get("/api/dashboard/approvals", async (request) => {
    const user = request.user as Record<string, unknown>;
    const userId = user.sub as string;
    const demo = isDemoMode();
    const ds = getDataSource(demo);
    const data = await ds.getApprovals(userId);
    return wrapResponse(data, ds.source);
  });

  // ── Audit Logs ──
  fastify.get("/api/dashboard/audit-log", async (request) => {
    const user = request.user as Record<string, unknown>;
    const userId = user.sub as string;
    const demo = isDemoMode();
    const ds = getDataSource(demo);
    const data = await ds.getAuditLogs(userId);
    return wrapResponse(data, ds.source);
  });

  // ── Integration Status ──
  fastify.get("/api/dashboard/integrations", async (request) => {
    const user = request.user as Record<string, unknown>;
    const userId = user.sub as string;
    const demo = isDemoMode();
    const ds = getDataSource(demo);
    const data = await ds.getIntegrationStatus(userId);
    return wrapResponse(data, ds.source);
  });
}
