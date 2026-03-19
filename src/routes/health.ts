import type { FastifyInstance } from "fastify";

/**
 * GET /health
 *
 * Unauthenticated health-check endpoint for readiness probes.
 */
export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });
}
