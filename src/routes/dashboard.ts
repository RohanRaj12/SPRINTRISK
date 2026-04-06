/**
 * Sprint Guardian — Dashboard API Routes
 *
 * Serves dashboard data through the live DataSource.
 */

import type { FastifyInstance } from "fastify";
import { getDataSource, wrapResponse } from "../data/index.js";

export async function dashboardRoutes(fastify: FastifyInstance) {
  // ── Auth Debug (temporary) ──
  fastify.get("/api/dashboard/auth-debug", async (request) => {
    const user = request.user as Record<string, unknown> | undefined;
    const authHeader = request.headers.authorization;
    return {
      hasAuthHeader: !!authHeader,
      tokenPrefix: authHeader ? authHeader.substring(0, 20) + "..." : null,
      tokenLength: authHeader ? authHeader.length : 0,
      userDecoded: user ? { sub: user.sub, iss: user.iss, aud: user.aud } : null,
      isAuthenticated: !!user?.sub,
    };
  });

  // ── Sprint Issues ──
  fastify.get("/api/dashboard/issues", async (request) => {
    const user = request.user as Record<string, unknown> | undefined;
    const userId = (user?.sub as string) || "system";
    const ds = getDataSource();
    const data = await ds.getSprintIssues(userId);
    const warnings: string[] = [];
    if (!user?.sub) {
      warnings.push("Not authenticated — showing limited data. Please log in for full integration access.");
    }
    if (data.length === 0 && user?.sub) {
      warnings.push("No issues found. Ensure your GitHub and Jira integrations are connected on the Integrations page.");
    }
    return wrapResponse(data, ds.source, warnings);
  });

  // ── GitHub PRs ──
  fastify.get("/api/dashboard/prs", async (request) => {
    const user = request.user as Record<string, unknown> | undefined;
    const userId = (user?.sub as string) || "system";
    const ds = getDataSource();
    const data = await ds.getGithubPRs(userId);
    const warnings: string[] = [];
    if (data.length === 0 && user?.sub) {
      warnings.push("No PRs found. Ensure your GitHub account is connected on the Integrations page, or set GITHUB_TOKEN in .env for dev mode.");
    }
    return wrapResponse(data, ds.source, warnings);
  });

  // ── Approvals ──
  fastify.get("/api/dashboard/approvals", async (request) => {
    const user = request.user as Record<string, unknown> | undefined;
    const userId = (user?.sub as string) || "system";
    const ds = getDataSource();
    const data = await ds.getApprovals(userId);
    return wrapResponse(data, ds.source);
  });

  // ── Audit Logs ──
  fastify.get("/api/dashboard/audit-log", async (request) => {
    const user = request.user as Record<string, unknown> | undefined;
    const userId = (user?.sub as string) || "system";
    const ds = getDataSource();
    const data = await ds.getAuditLogs(userId);
    return wrapResponse(data, ds.source);
  });

  // ── Integration Status ──
  fastify.get("/api/dashboard/integrations", async (request) => {
    const user = request.user as Record<string, unknown> | undefined;
    const userId = (user?.sub as string) || "system";
    const ds = getDataSource();
    const data = await ds.getIntegrationStatus(userId);
    return wrapResponse(data, ds.source);
  });
}
