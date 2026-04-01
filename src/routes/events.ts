/**
 * Sprint Guardian — Server-Sent Events (SSE) Route
 *
 * Provides a real-time event stream to the frontend.
 * Events include: audit findings, approval requests, integration status changes.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// ── Event Types ──

export interface SSEEvent {
  type: "audit_finding" | "approval_request" | "integration_change" | "audit_complete" | "notification";
  data: Record<string, unknown>;
  timestamp: string;
}

// ── Global event bus (in-memory) ──

type EventListener = (event: SSEEvent) => void;
const listeners = new Set<EventListener>();

export function emitEvent(event: SSEEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Remove broken listeners
      listeners.delete(listener);
    }
  }
}

export function emitNotification(type: SSEEvent["type"], data: Record<string, unknown>): void {
  emitEvent({ type, data, timestamp: new Date().toISOString() });
}

// ── Route ──

export async function eventRoutes(fastify: FastifyInstance) {
  fastify.get("/api/events/stream", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send initial heartbeat
    reply.raw.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

    // Register listener
    const onEvent: EventListener = (event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    listeners.add(onEvent);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      reply.raw.write(`: heartbeat\n\n`);
    }, 30_000);

    // Cleanup on disconnect
    request.raw.on("close", () => {
      listeners.delete(onEvent);
      clearInterval(heartbeat);
    });

    // Don't let Fastify auto-close the response
    await new Promise(() => {});
  });
}
