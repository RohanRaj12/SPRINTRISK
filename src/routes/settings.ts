/**
 * Sprint Guardian — Settings API Routes
 *
 * Manages demo mode toggle and other org-level settings.
 */

import type { FastifyInstance } from "fastify";
import { isDemoMode, setDemoMode } from "../data/index.js";

export async function settingsRoutes(fastify: FastifyInstance) {
  // ── Get demo mode status ──
  fastify.get("/api/settings/demo-mode", async () => {
    return { demoMode: isDemoMode() };
  });

  // ── Toggle demo mode ──
  fastify.post<{ Body: { enabled: boolean } }>(
    "/api/settings/demo-mode",
    {
      schema: {
        body: {
          type: "object",
          required: ["enabled"],
          properties: {
            enabled: { type: "boolean" },
          },
        },
      },
    },
    async (request) => {
      const { enabled } = request.body;
      setDemoMode(enabled);

      request.log.info(
        { demoMode: enabled },
        `Demo mode ${enabled ? "ENABLED" : "DISABLED"}`
      );

      return { demoMode: enabled, source: enabled ? "demo" : "live" };
    }
  );
}
