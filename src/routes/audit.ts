import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  executeOrchestrated,
  type AuditRunInput,
} from "../agent/index.js";

/**
 * POST /audit/trigger
 *
 * Trigger an orchestrated 7-phase sprint audit.
 * Accepts target parameters (Jira site, GitHub repo, etc.)
 * and runs the full OBSERVE → DIAGNOSE → PLAN → CLASSIFY → EXECUTE → VERIFY → LEARN pipeline.
 */

interface TriggerBody {
  jiraSite?: string;
  jiraProjectKey?: string;
  githubOwner?: string;
  githubRepo?: string;
  slackChannel?: string;
}

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: TriggerBody }>(
    "/audit/trigger",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            jiraSite: { type: "string" },
            jiraProjectKey: { type: "string" },
            githubOwner: { type: "string" },
            githubRepo: { type: "string" },
            slackChannel: { type: "string" },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: TriggerBody }>, reply: FastifyReply) => {
      const user = request.user as Record<string, unknown>;
      const userId = user.sub as string;
      const orgId = (user.org_id as string) ?? "default-org";

      request.log.info({ userId }, "Orchestrated audit triggered");

      try {
        const auditInput: AuditRunInput = {
          userId,
          orgId,
          triggerType: "manual",
          jiraSite: request.body?.jiraSite,
          jiraProjectKey: request.body?.jiraProjectKey,
          githubOwner: request.body?.githubOwner,
          githubRepo: request.body?.githubRepo,
          slackChannel: request.body?.slackChannel,
        };

        const result = await executeOrchestrated(auditInput);

        request.log.info(
          {
            runId: result.run.id,
            status: result.run.status,
            steps: result.run.totalSteps,
            completed: result.run.completedSteps,
          },
          "Orchestrated audit completed"
        );

        return {
          status: result.run.status,
          runId: result.run.id,
          summary: result.run.finalResponse,
          phases: {
            observations: {
              jiraIssues: result.observations.jira?.totalOpenIssues ?? 0,
              staleTickets: result.observations.jira?.staleTickets?.length ?? 0,
              openPRs: result.observations.github?.totalOpenPRs ?? 0,
              failingCI: result.observations.github?.failingCI?.length ?? 0,
            },
            diagnosis: {
              rootCause: result.diagnosis.rootCause,
              severity: result.diagnosis.severity,
              correlations: result.diagnosis.correlations.length,
            },
            plan: {
              totalSteps: result.plan.steps.length,
              confidence: result.plan.confidence,
            },
            classification: {
              auto: result.classifiedSteps.filter((s) => s.classification === "auto").length,
              approvalRequired: result.classifiedSteps.filter((s) => s.classification === "approval_required").length,
            },
            execution: result.executionResults.map((r) => ({
              step: result.classifiedSteps[r.stepIndex].step.description,
              action: result.classifiedSteps[r.stepIndex].step.actionType,
              risk: result.classifiedSteps[r.stepIndex].riskLevel,
              classification: r.classification,
              status: r.status,
              approvalId: r.approvalId,
            })),
          },
          triggeredBy: userId,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        request.log.error(err, "Orchestrated audit failed");
        reply.status(500).send({
          error: "Audit failed",
          message: "An internal error occurred during the audit. Please try again.",
        });
      }
    }
  );
}
