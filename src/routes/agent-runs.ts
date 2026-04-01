/**
 * Sprint Guardian — Agent Run Routes
 *
 * API endpoints for viewing agent run history and audit logs.
 *
 * Endpoints:
 * - GET /api/agent-runs         — List recent agent runs
 * - GET /api/agent-runs/:id     — Get run detail with steps
 * - GET /api/audit-logs         — Query audit log entries
 * - GET /api/audit-logs/summary — Get category summary counts
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  queryAuditLogs,
  getAuditSummary,
} from "../services/audit-logger.js";
import {
  getRunsByOrg,
  getRunById,
} from "../agent/index.js";
import type {
  AuditCategory,
  AuditSeverity,
} from "../agent/types.js";

export async function agentRunRoutes(fastify: FastifyInstance) {
  // ── GET /api/agent-runs ──
  fastify.get(
    "/api/agent-runs",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            offset: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; limit?: number; offset?: number };
      }>
    ) => {
      const user = request.user as Record<string, unknown>;
      const orgId = (user.org_id as string) ?? "default-org";

      const { status, limit = 20, offset = 0 } = request.query;

      let runs = getRunsByOrg(orgId, 100);
      if (status) {
        runs = runs.filter((r) => r.status === status);
      }

      const total = runs.length;
      return {
        runs: runs.slice(offset, offset + limit),
        total,
      };
    }
  );

  // ── GET /api/agent-runs/:id ──
  fastify.get(
    "/api/agent-runs/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const run = getRunById(id);

      if (!run) {
        reply.status(404).send({
          error: "Run not found",
          message: `No agent run found with ID: ${id}`,
        });
        return;
      }

      return { run };
    }
  );

  // ── GET /api/audit-logs ──
  fastify.get(
    "/api/audit-logs",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["agent", "approval", "integration", "auth", "system"],
            },
            severity: {
              type: "string",
              enum: ["info", "warning", "error", "critical"],
            },
            runId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            offset: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          category?: AuditCategory;
          severity?: AuditSeverity;
          runId?: string;
          limit?: number;
          offset?: number;
        };
      }>
    ) => {
      const user = request.user as Record<string, unknown>;
      const orgId = (user.org_id as string) ?? "default-org";

      const { category, severity, runId, limit, offset } = request.query;

      const result = queryAuditLogs({
        orgId,
        category,
        severity,
        runId,
        limit,
        offset,
      });

      return result;
    }
  );

  // ── GET /api/audit-logs/summary ──
  fastify.get("/api/audit-logs/summary", async (request: FastifyRequest) => {
    const user = request.user as Record<string, unknown>;
    const orgId = (user.org_id as string) ?? "default-org";

    return {
      summary: getAuditSummary(orgId),
    };
  });
}
