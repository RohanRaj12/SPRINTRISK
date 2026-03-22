/**
 * Sprint Guardian — Approval Routes
 *
 * API endpoints for the human-in-the-loop approval system.
 *
 * Endpoints:
 * - GET  /api/approvals         — List pending approvals
 * - GET  /api/approvals/:id     — Get approval detail
 * - POST /api/approvals/:id/approve — Approve an action
 * - POST /api/approvals/:id/reject  — Reject an action
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  getPendingApprovals,
  getApprovalById,
  decideApproval,
  getApprovals,
} from "../services/approval-service.js";
import {
  logApprovalDecision,
} from "../services/audit-logger.js";

export async function approvalRoutes(fastify: FastifyInstance) {
  // ── GET /api/approvals ──
  fastify.get(
    "/api/approvals",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "approved", "rejected", "expired"] },
          },
        },
      },
    },
    async (request: FastifyRequest<{
      Querystring: { status?: string };
    }>, reply: FastifyReply) => {
      const user = request.user as Record<string, unknown>;
      const orgId = (user.org_id as string) ?? "default-org"; // TODO: extract from JWT

      const { status } = request.query;

      const approvals = status
        ? getApprovals(orgId, status as any)
        : getPendingApprovals(orgId);

      return {
        approvals,
        total: approvals.length,
      };
    }
  );

  // ── GET /api/approvals/:id ──
  fastify.get(
    "/api/approvals/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const approval = getApprovalById(id);

      if (!approval) {
        reply.status(404).send({
          error: "Approval not found",
          message: `No approval found with ID: ${id}`,
        });
        return;
      }

      return { approval };
    }
  );

  // ── POST /api/approvals/:id/approve ──
  fastify.post(
    "/api/approvals/:id/approve",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            note: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { note?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { note } = request.body ?? {};
      const user = request.user as Record<string, unknown>;
      const userId = user.sub as string;

      try {
        const approval = decideApproval({
          approvalId: id,
          decidedBy: userId,
          status: "approved",
          note,
        });

        // Audit log
        logApprovalDecision(
          approval.orgId,
          userId,
          approval.runId,
          approval.stepId,
          "approved",
          note
        );

        request.log.info(
          { approvalId: id, userId },
          "Approval approved"
        );

        return { approval };
      } catch (err) {
        reply.status(400).send({
          error: "Approval failed",
          message:
            err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  );

  // ── POST /api/approvals/:id/reject ──
  fastify.post(
    "/api/approvals/:id/reject",
    {
      schema: {
        body: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { reason } = request.body;
      const user = request.user as Record<string, unknown>;
      const userId = user.sub as string;

      try {
        const approval = decideApproval({
          approvalId: id,
          decidedBy: userId,
          status: "rejected",
          note: reason,
        });

        // Audit log
        logApprovalDecision(
          approval.orgId,
          userId,
          approval.runId,
          approval.stepId,
          "rejected",
          reason
        );

        request.log.info(
          { approvalId: id, userId, reason },
          "Approval rejected"
        );

        return { approval };
      } catch (err) {
        reply.status(400).send({
          error: "Rejection failed",
          message:
            err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  );
}
