// Load .env FIRST — must happen before any TLS connections
import "dotenv/config";

import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import authPlugin from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { chatRoutes } from "./routes/chat.js";
import { auditRoutes } from "./routes/audit.js";
import { approvalRoutes } from "./routes/approvals.js";
import { agentRunRoutes } from "./routes/agent-runs.js";
import { integrationRoutes } from "./routes/integrations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { settingsRoutes } from "./routes/settings.js";
import { eventRoutes } from "./routes/events.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { getConnectionManager } from "./integrations/index.js";

async function main() {
  const app = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
    bodyLimit: 1_048_576, // 1 MB
  });

  // ── Global plugins ──
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o: string) => o.trim());
  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  });
  await app.register(authPlugin);

  // ── Routes ──
  await app.register(healthRoutes);
  await app.register(chatRoutes);
  await app.register(auditRoutes);
  await app.register(approvalRoutes);
  await app.register(agentRunRoutes);
  await app.register(integrationRoutes);
  await app.register(dashboardRoutes);
  await app.register(settingsRoutes);
  await app.register(eventRoutes);
  await app.register(webhookRoutes);
  await app.register(analyticsRoutes);

  // ── Start ──
  try {
    const address = await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
    app.log.info(`Sprint Guardian listening at ${address}`);

    // ── Initialize Connection Manager ──
    const connManager = getConnectionManager();
    app.log.info("Testing integration connections...");
    await connManager.checkAll();

    const statuses = connManager.getAllStatuses();
    for (const s of statuses) {
      const icon = s.status === "connected" ? "[OK]" : s.status === "error" ? "[ERR]" : "[--]";
      app.log.info(`  ${icon} ${s.displayName}: ${s.status}${s.account ? ` (${s.account})` : ""}${s.error && s.status !== "disconnected" ? ` — ${s.error}` : ""}`);
    }

    const connected = connManager.getConnectedCount();
    app.log.info(`${connected}/${statuses.length} integrations connected`);

    // Start periodic health checks (every 60s)
    connManager.startPolling(60_000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
