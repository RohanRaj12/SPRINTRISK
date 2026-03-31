/**
 * Sprint Guardian — Agent Orchestrator
 *
 * Implements the structured 7-phase agent loop:
 *   OBSERVE → DIAGNOSE → PLAN → CLASSIFY → EXECUTE → VERIFY → LEARN
 *
 * Unlike the freeform chat agent (agent.ts), this orchestrator runs
 * a deterministic pipeline where each phase produces artifacts consumed
 * by the next. Every action is audited, classified by risk, and gated
 * by the policy engine before execution.
 */

import { randomUUID } from "node:crypto";
import { createToolRegistry } from "../tools/index.js";
import { generatePlan, validatePlan } from "./planner.js";
import { classifyPlan, type ClassifiedStep } from "./classifier.js";
import type {
  AgentRun,
  AgentStep,
  AgentPhase,
  ObservationData,
  Diagnosis,
  AgentPlan,
  RiskLevel,
} from "./types.js";
import {
  logAgentPhase,
  logStepExecution,
  logAuditEvent,
} from "../services/audit-logger.js";
import {
  createApproval,
  getPendingApprovals,
} from "../services/approval-service.js";
import {
  retrieveRelevantMemories,
  learnFromRun,
} from "../services/memory-service.js";
import { getDataSource } from "../data/index.js";

// ── Tool Registry (singleton) ──
const registry = createToolRegistry();

// ── In-memory run store ──
const runStore = new Map<string, AgentRun>();

/**
 * Input to start an orchestrated audit run.
 */
export interface AuditRunInput {
  userId: string;
  orgId: string;
  triggerType: "manual" | "scheduled" | "webhook";

  // Target parameters
  jiraSite?: string;
  jiraProjectKey?: string;
  githubOwner?: string;
  githubRepo?: string;
  slackChannel?: string;
}

/**
 * Result from a completed orchestrator run.
 */
export interface OrchestratorResult {
  run: AgentRun;
  observations: ObservationData;
  diagnosis: Diagnosis;
  plan: AgentPlan;
  classifiedSteps: ClassifiedStep[];
  executionResults: Array<{
    stepIndex: number;
    classification: string;
    status: string;
    result?: unknown;
    approvalId?: string;
  }>;
}

/**
 * Execute the full 7-phase agent loop.
 */
export async function executeOrchestrated(
  input: AuditRunInput
): Promise<OrchestratorResult> {
  const runId = `run_${randomUUID()}`;
  const startedAt = new Date();

  // Initialize run record
  const run: AgentRun = {
    id: runId,
    orgId: input.orgId,
    triggeredBy: input.userId,
    status: "pending",
    triggerType: input.triggerType,
    inputPrompt: `Audit sprint health for ${input.jiraProjectKey ?? "project"} / ${input.githubOwner ?? "org"}/${input.githubRepo ?? "repo"}`,
    totalSteps: 0,
    completedSteps: 0,
    totalTokens: 0,
    steps: [],
    startedAt,
    createdAt: startedAt,
    retryCount: 0,
  };
  runStore.set(runId, run);

  logAuditEvent({
    orgId: input.orgId,
    userId: input.userId,
    runId,
    action: "agent.run.started",
    category: "agent",
    severity: "info",
    description: `Orchestrated audit run started (trigger: ${input.triggerType})`,
    metadata: {
      jiraProject: input.jiraProjectKey,
      githubRepo: `${input.githubOwner}/${input.githubRepo}`,
    },
  });

  try {
    // ═══════════════════════════════════════════════
    // PHASE 1: OBSERVE — Gather data from all sources
    // ═══════════════════════════════════════════════
    run.status = "observing";
    logAgentPhase(input.orgId, runId, "observe", "Gathering data from Jira, GitHub, and Slack");

    const observations = await phaseObserve(input);

    logAgentPhase(input.orgId, runId, "observe", "Observation complete", {
      jiraIssues: observations.jira?.totalOpenIssues ?? 0,
      staleTickets: observations.jira?.staleTickets?.length ?? 0,
      openPRs: observations.github?.totalOpenPRs ?? 0,
      failingCI: observations.github?.failingCI?.length ?? 0,
    } as Record<string, unknown>);

    // ═══════════════════════════════════════════════
    // PHASE 2: DIAGNOSE — Identify root causes via LLM
    // ═══════════════════════════════════════════════
    run.status = "diagnosing";
    logAgentPhase(input.orgId, runId, "diagnose", "Analyzing observations for root causes");

    const memories = retrieveRelevantMemories(input.orgId, {
      actionTypes: ["jira_analyzer", "github_investigator", "slack_notifier"],
      types: ["pattern", "outcome"],
    });

    const { diagnosis, plan } = await generatePlan(observations, memories);

    logAgentPhase(input.orgId, runId, "diagnose", `Root cause: ${diagnosis.rootCause}`, {
      severity: diagnosis.severity,
      affectedAreas: diagnosis.affectedAreas,
      correlations: diagnosis.correlations.length,
    });

    // ═══════════════════════════════════════════════
    // PHASE 3: PLAN — Validate the generated plan
    // ═══════════════════════════════════════════════
    run.status = "planning";
    logAgentPhase(input.orgId, runId, "plan", `Generated ${plan.steps.length}-step plan: ${plan.summary}`);

    const validationErrors = validatePlan(plan);
    if (validationErrors.length > 0) {
      logAgentPhase(input.orgId, runId, "plan", `Plan validation warnings: ${validationErrors.join("; ")}`, {
        errors: validationErrors,
      });
    }

    run.plan = plan;
    run.totalSteps = plan.steps.length;

    // ═══════════════════════════════════════════════
    // PHASE 4: CLASSIFY — Tag each step as auto/approval
    // ═══════════════════════════════════════════════
    logAgentPhase(input.orgId, runId, "classify", "Classifying steps by risk level");

    const classifiedSteps = classifyPlan(plan.steps, {}, memories);

    const autoCount = classifiedSteps.filter((s) => s.classification === "auto").length;
    const approvalCount = classifiedSteps.filter((s) => s.classification === "approval_required").length;

    logAgentPhase(input.orgId, runId, "classify", `Classification complete: ${autoCount} auto, ${approvalCount} require approval`, {
      classifications: classifiedSteps.map((s) => ({
        action: s.step.actionType,
        risk: s.riskLevel,
        classification: s.classification,
      })),
    });

    // Build AgentStep records
    run.steps = classifiedSteps.map((cs, idx) => ({
      id: `step_${randomUUID()}`,
      stepIndex: idx,
      phase: "execute" as AgentPhase,
      status: "pending" as const,
      classification: cs.classification,
      actionType: cs.step.actionType,
      actionDescription: cs.step.description,
      actionParams: cs.step.params,
      riskLevel: cs.riskLevel,
      riskReasoning: cs.riskReasoning,
      retryCount: 0,
      maxRetries: 2,
    }));

    // ═══════════════════════════════════════════════
    // PHASE 5: EXECUTE — Run auto steps, queue approvals
    // ═══════════════════════════════════════════════
    run.status = "executing";
    logAgentPhase(input.orgId, runId, "execute", "Beginning step execution");

    const executionResults = await phaseExecute(input, run, classifiedSteps);

    // ═══════════════════════════════════════════════
    // PHASE 6: VERIFY — Check execution outcomes
    // ═══════════════════════════════════════════════
    run.status = "verifying";
    logAgentPhase(input.orgId, runId, "verify", "Verifying execution outcomes");

    const completedCount = executionResults.filter((r) => r.status === "completed").length;
    const failedCount = executionResults.filter((r) => r.status === "failed").length;
    const pendingApprovalCount = executionResults.filter((r) => r.status === "waiting_approval").length;

    logAgentPhase(input.orgId, runId, "verify", `Verification: ${completedCount} completed, ${failedCount} failed, ${pendingApprovalCount} pending approval`, {
      completedCount,
      failedCount,
      pendingApprovalCount,
    });

    // ═══════════════════════════════════════════════
    // PHASE 7: LEARN — Store patterns and outcomes
    // ═══════════════════════════════════════════════
    logAgentPhase(input.orgId, runId, "learn", "Recording outcomes for future improvement");

    const stepsForLearning = executionResults
      .filter((r) => r.status === "completed" || r.status === "failed")
      .map((r) => ({
        actionType: classifiedSteps[r.stepIndex].step.actionType,
        success: r.status === "completed",
        result: r.result,
        errorMessage: r.status === "failed" ? String(r.result) : undefined,
      }));

    const newMemories = learnFromRun(input.orgId, runId, {
      observations: observations as unknown as Record<string, unknown>,
      diagnosis: diagnosis.rootCause,
      stepsExecuted: stepsForLearning,
      overallSuccess: failedCount === 0,
    });

    logAgentPhase(input.orgId, runId, "learn", `Stored ${newMemories.length} memory entries`);

    // ── Finalize run ──
    run.status = failedCount > 0 ? "failed" : pendingApprovalCount > 0 ? "waiting_approval" : "completed";
    run.completedSteps = completedCount;
    run.completedAt = new Date();
    run.finalResponse = buildRunSummary(observations, diagnosis, plan, executionResults, classifiedSteps);
    runStore.set(runId, run);

    logAuditEvent({
      orgId: input.orgId,
      userId: input.userId,
      runId,
      action: "agent.run.completed",
      category: "agent",
      severity: failedCount > 0 ? "warning" : "info",
      description: `Run ${run.status}: ${completedCount}/${plan.steps.length} steps completed`,
    });

    return {
      run,
      observations,
      diagnosis,
      plan,
      classifiedSteps,
      executionResults,
    };
  } catch (err) {
    run.status = "failed";
    run.errorMessage = err instanceof Error ? err.message : String(err);
    run.completedAt = new Date();
    runStore.set(runId, run);

    logAuditEvent({
      orgId: input.orgId,
      userId: input.userId,
      runId,
      action: "agent.run.failed",
      category: "agent",
      severity: "error",
      description: `Run failed: ${run.errorMessage}`,
    });

    throw err;
  }
}

// ═══════════════════════════════════════════════
// Phase Implementation Functions
// ═══════════════════════════════════════════════

/**
 * OBSERVE: Gather data from Jira, GitHub, and Slack using tool adapters.
 */
async function phaseObserve(input: AuditRunInput): Promise<ObservationData> {
  const observations: ObservationData = {};

  // Call real tools via Token Vault
  const jiraTool = registry.get("jira_analyzer");
  const githubTool = registry.get("github_investigator");

  const [jiraResult, githubResult] = await Promise.allSettled([
    input.jiraSite && input.jiraProjectKey && jiraTool
      ? jiraTool.execute(
          {
            jira_site: input.jiraSite,
            project_key: input.jiraProjectKey,
          },
          input.userId
        )
      : Promise.resolve(null),
    input.githubOwner && input.githubRepo && githubTool
      ? githubTool.execute(
          {
            owner: input.githubOwner,
            repo: input.githubRepo,
          },
          input.userId
        )
      : Promise.resolve(null),
  ]);

  if (jiraResult.status === "fulfilled" && jiraResult.value) {
    const jr = jiraResult.value as any;
    observations.jira = {
      totalOpenIssues: jr.totalOpenIssues ?? 0,
      staleTickets: jr.staleTickets ?? [],
    };
  }

  if (githubResult.status === "fulfilled" && githubResult.value) {
    const gr = githubResult.value as any;
    observations.github = {
      totalOpenPRs: gr.totalOpenPRs ?? 0,
      stalePRs: gr.stalePRs ?? [],
      failingCI: gr.failingCI ?? [],
    };
  }

  return observations;
}

/**
 * EXECUTE: Run auto steps directly, create approvals for gated steps.
 */
async function phaseExecute(
  input: AuditRunInput,
  run: AgentRun,
  classifiedSteps: ClassifiedStep[]
): Promise<
  Array<{
    stepIndex: number;
    classification: string;
    status: string;
    result?: unknown;
    approvalId?: string;
  }>
> {
  const results: Array<{
    stepIndex: number;
    classification: string;
    status: string;
    result?: unknown;
    approvalId?: string;
  }> = [];

  for (let i = 0; i < classifiedSteps.length; i++) {
    const cs = classifiedSteps[i];
    const step = run.steps[i];

    if (cs.classification === "approval_required") {
      // Create approval request — don't execute yet
      step.status = "waiting_approval";
      const approval = createApproval({
        orgId: input.orgId,
        stepId: step.id,
        runId: run.id,
        title: cs.step.description,
        description: cs.riskReasoning,
        actionPreview: cs.step.params,
        riskLevel: cs.riskLevel,
        riskReasoning: cs.riskReasoning,
      });

      logStepExecution(input.orgId, run.id, step.id, cs.step.actionType, false, {
        event: "approval_requested",
        approvalId: approval.id,
        riskLevel: cs.riskLevel,
      });

      results.push({
        stepIndex: i,
        classification: cs.classification,
        status: "waiting_approval",
        approvalId: approval.id,
      });
      continue;
    }

    // Auto-execute
    step.status = "running";
    step.startedAt = new Date();

    try {
      const tool = registry.get(cs.step.actionType);
      if (!tool) {
        throw new Error(`Unknown tool: ${cs.step.actionType}`);
      }

      const toolResult = await Promise.race([
        tool.execute(cs.step.params, input.userId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Tool execution timed out (30s)")), 30_000)
        ),
      ]);

      step.status = "completed";
      step.result = toolResult;
      step.completedAt = new Date();

      logStepExecution(input.orgId, run.id, step.id, cs.step.actionType, true, {
        duration: step.completedAt.getTime() - step.startedAt.getTime(),
      });

      results.push({
        stepIndex: i,
        classification: cs.classification,
        status: "completed",
        result: toolResult,
      });
    } catch (err) {
      step.status = "failed";
      step.errorMessage = err instanceof Error ? err.message : String(err);
      step.completedAt = new Date();

      logStepExecution(input.orgId, run.id, step.id, cs.step.actionType, false, {
        error: step.errorMessage,
      });

      results.push({
        stepIndex: i,
        classification: cs.classification,
        status: "failed",
        result: step.errorMessage,
      });
    }
  }

  return results;
}

// ── Summary Builder ──

function buildRunSummary(
  observations: ObservationData,
  diagnosis: Diagnosis,
  plan: AgentPlan,
  executionResults: Array<{ stepIndex: number; status: string }>,
  classifiedSteps: ClassifiedStep[]
): string {
  const lines: string[] = [];

  lines.push("# Sprint Health Audit Report\n");

  // Observations
  lines.push("## Observations");
  if (observations.jira) {
    lines.push(`- **Jira**: ${observations.jira.totalOpenIssues} open issues, ${observations.jira.staleTickets.length} stale`);
  }
  if (observations.github) {
    lines.push(`- **GitHub**: ${observations.github.totalOpenPRs} open PRs, ${observations.github.failingCI.length} failing CI`);
  }

  // Diagnosis
  lines.push(`\n## Diagnosis`);
  lines.push(`**Root Cause**: ${diagnosis.rootCause}`);
  lines.push(`**Severity**: ${diagnosis.severity}`);
  if (diagnosis.correlations.length > 0) {
    lines.push(`\n### Cross-System Correlations`);
    for (const c of diagnosis.correlations) {
      lines.push(`- ${c.description} (entities: ${c.entities.join(", ")})`);
    }
  }

  // Execution
  lines.push(`\n## Execution Summary`);
  const completed = executionResults.filter((r) => r.status === "completed").length;
  const failed = executionResults.filter((r) => r.status === "failed").length;
  const pending = executionResults.filter((r) => r.status === "waiting_approval").length;
  lines.push(`- **Completed**: ${completed}/${plan.steps.length}`);
  if (failed > 0) lines.push(`- **Failed**: ${failed}`);
  if (pending > 0) lines.push(`- **Awaiting Approval**: ${pending}`);

  // Step details
  lines.push(`\n## Step Details`);
  for (const r of executionResults) {
    const cs = classifiedSteps[r.stepIndex];
    const icon = r.status === "completed" ? "✅" : r.status === "failed" ? "❌" : "⏳";
    lines.push(`${icon} **${cs.step.description}** — ${r.status} (risk: ${cs.riskLevel}, ${cs.classification})`);
  }

  return lines.join("\n");
}

// ── Query Functions ──

export function getRunById(runId: string): AgentRun | undefined {
  return runStore.get(runId);
}

export function getRunsByOrg(orgId: string, limit = 20): AgentRun[] {
  const runs: AgentRun[] = [];
  for (const run of runStore.values()) {
    if (run.orgId === orgId) runs.push(run);
  }
  return runs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}
