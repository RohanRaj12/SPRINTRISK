import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { executeAudit } from "../scheduler/index.js";

/**
 * POST /audit/trigger
 *
 * Manually trigger a sprint audit (authenticated).
 * Useful for testing or on-demand audits outside the cron schedule.
 */
export async function auditRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/audit/trigger",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as Record<string, unknown>;

      request.log.info({ userId: user.sub }, "Manual audit triggered");

      // Fire-and-forget: run audit in background, return immediately
      executeAudit().catch((err) =>
        request.log.error(err, "Manual audit failed")
      );

      return {
        status: "audit_started",
        message: "Sprint audit has been triggered and is running in the background.",
        triggeredBy: user.sub,
        timestamp: new Date().toISOString(),
      };
    }
  );
}
