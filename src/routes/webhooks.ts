/**
 * Sprint Guardian — Webhook Routes
 *
 * Receives events from Jira, GitHub, and Slack webhooks.
 * Each webhook:
 *   1. Verifies signature (when secret is configured)
 *   2. Parses the event
 *   3. Emits SSE notification to connected frontends
 *   4. Triggers the Reactive Agent for autonomous actions
 *
 * GitHub events monitored:
 *   - pull_request (opened, closed, review_requested, synchronize)
 *   - check_run / check_suite (CI status changes)
 *   - push (commits to default branch)
 *   - issues (created, labeled)
 *
 * Jira events monitored:
 *   - jira:issue_updated (status transitions, priority changes, assignments)
 *   - jira:issue_created (new blockers, high-priority issues)
 *   - jira:issue_deleted (cleanup tracking)
 *
 * Why each endpoint matters for the agent:
 *   - PRs feed the "review bottleneck" detection
 *   - CI failures trigger immediate Slack alerts + PR labeling
 *   - Jira status changes detect regressions and stale work
 *   - Push events track deployment velocity
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { emitNotification } from "./events.js";
import { verifyGitHubWebhookSignature } from "../integrations/github-client.js";
import { config } from "../config.js";
import { processEvent, getRecentActions, runProactiveHealthCheck } from "../agents/reactive-agent.js";

export async function webhookRoutes(fastify: FastifyInstance) {
  // ── Jira Webhook ──
  fastify.post("/api/webhooks/jira", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const eventType = (body.webhookEvent as string) ?? "unknown";
    const issueKey = (body.issue as any)?.key ?? "unknown";

    request.log.info({ eventType, issueKey }, "Jira webhook received");

    emitNotification("audit_finding", {
      source: "jira",
      event: eventType,
      issueKey,
      summary: `Jira event: ${eventType} on ${issueKey}`,
    });

    // Trigger reactive agent
    const actions = await processEvent({
      source: "jira",
      eventType,
      payload: body,
      receivedAt: new Date().toISOString(),
    });

    request.log.info({ eventType, issueKey, actionsCount: actions.length }, "Jira webhook processed");

    return { received: true, event: eventType, agentActions: actions };
  });

  // ── GitHub Webhook ──
  fastify.post("/api/webhooks/github", {
    config: { rawBody: true },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Signature verification
    if (config.github.webhookSecret) {
      const signature = request.headers["x-hub-signature-256"] as string;
      const rawBody = JSON.stringify(request.body);

      if (!signature || !verifyGitHubWebhookSignature(rawBody, signature, config.github.webhookSecret)) {
        request.log.warn("GitHub webhook signature verification failed");
        reply.status(401).send({ error: "Invalid signature" });
        return;
      }
    }

    const body = request.body as Record<string, unknown>;
    const action = (body.action as string) ?? "unknown";
    const repo = (body.repository as any)?.full_name ?? "unknown";
    const githubEvent = (request.headers["x-github-event"] as string) ?? "push";

    request.log.info({ githubEvent, action, repo }, "GitHub webhook received");

    let notificationType: "audit_finding" | "notification" = "notification";
    let summary = `GitHub: ${githubEvent}`;

    if (githubEvent === "pull_request") {
      summary = `PR ${action} in ${repo}`;
      if (action === "opened" || action === "reopened") {
        notificationType = "audit_finding";
      }
    } else if (githubEvent === "check_run" || githubEvent === "check_suite") {
      const conclusion = (body.check_run as any)?.conclusion ?? (body.check_suite as any)?.conclusion;
      if (conclusion === "failure") {
        notificationType = "audit_finding";
        summary = `CI failure in ${repo}`;
      }
    } else if (githubEvent === "push") {
      summary = `Push to ${repo}`;
    }

    emitNotification(notificationType, {
      source: "github",
      event: githubEvent,
      action,
      repo,
      summary,
    });

    // Trigger reactive agent
    const actions = await processEvent({
      source: "github",
      eventType: githubEvent,
      action,
      payload: body,
      receivedAt: new Date().toISOString(),
    });

    request.log.info({ githubEvent, action, repo, actionsCount: actions.length }, "GitHub webhook processed");

    return { received: true, event: githubEvent, agentActions: actions };
  });

  // ── Slack Events ──
  fastify.post("/api/webhooks/slack", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Handle Slack URL verification challenge
    if (body.type === "url_verification") {
      return { challenge: body.challenge };
    }

    const eventType = (body.event as any)?.type ?? "unknown";
    request.log.info({ eventType }, "Slack event received");

    // Trigger reactive agent
    const actions = await processEvent({
      source: "slack",
      eventType,
      payload: body,
      receivedAt: new Date().toISOString(),
    });

    return { received: true, event: eventType, agentActions: actions };
  });

  // ── Agent Actions Log (PUBLIC) ──
  fastify.get("/api/agents/actions", async (request: FastifyRequest) => {
    const query = request.query as { limit?: string };
    const limit = Number(query.limit ?? "20");
    return { actions: getRecentActions(limit) };
  });

  // ── Proactive Health Check Trigger (PUBLIC — for demo) ──
  fastify.post("/api/agents/health-check", async () => {
    const result = await runProactiveHealthCheck();
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  });
}
