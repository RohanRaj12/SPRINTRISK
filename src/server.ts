import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import authPlugin from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { chatRoutes } from "./routes/chat.js";
import { auditRoutes } from "./routes/audit.js";
import { startScheduler } from "./scheduler/index.js";

async function main() {
  const app = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // ── Global plugins ──
  await app.register(cors, { origin: true });
  await app.register(authPlugin);

  // ── Routes ──
  await app.register(healthRoutes);
  await app.register(chatRoutes);
  await app.register(auditRoutes);

  // ── Start ──
  try {
    const address = await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
    app.log.info(`🛡️  Sprint Guardian listening at ${address}`);

    // ── Start cron scheduler after server is up ──
    startScheduler();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
