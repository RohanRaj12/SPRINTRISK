/**
 * Sprint Guardian — Agent Planner
 *
 * Takes observation data and generates a multi-step execution plan
 * using the LLM. The plan includes:
 * - Root cause diagnosis
 * - Ordered execution steps
 * - Risk assessment per step
 * - Expected outcomes
 */

import { getAIClient, type AIMessage } from "../lib/ai-client.js";
import type {
  ObservationData,
  Diagnosis,
  AgentPlan,
  PlannedStep,
  LLMPlanResponse,
  MemoryEntry,
} from "./types.js";

const PLANNING_PROMPT = `You are Sprint Guardian's planning engine. 
Given observation data from Jira, GitHub, and Slack, you must:

1. DIAGNOSE: Identify the root cause(s) of sprint health issues. 
   Look for correlations (e.g., a stale Jira ticket linked to a failing PR).
   Don't just list symptoms — find the WHY.

2. PLAN: Create a multi-step execution plan to resolve the issues.
   Each step should specify:
   - action_type: The tool to use (jira_analyzer, github_investigator, slack_notifier)
   - description: What this step does (human-readable)
   - params: Tool parameters
   - reasoning: Why this step is needed
   - expected_outcome: What success looks like
   - risk_level: low | medium | high | critical
   - depends_on: Array of step indexes this depends on (0-based)

Risk classification guidelines:
- low: Read-only operations (queries, analysis)
- medium: Notifications to channels
- high: Direct messages to individuals, creating/updating tickets
- critical: Bulk operations, automated code changes

Respond with a JSON object matching this schema exactly.`;

/**
 * Generate a diagnosis and execution plan from observation data.
 */
export async function generatePlan(
  observations: ObservationData,
  memories: MemoryEntry[] = []
): Promise<{ diagnosis: Diagnosis; plan: AgentPlan }> {
  const ai = getAIClient();

  // Build the context message
  const contextParts: string[] = [
    "## Current Sprint Observations\n",
    JSON.stringify(observations, null, 2),
  ];

  if (memories.length > 0) {
    contextParts.push(
      "\n## Learned Patterns from Previous Runs\n",
      memories
        .map(
          (m) =>
            `- [${m.type}] ${m.key}: ${m.content} (confidence: ${m.confidence})`
        )
        .join("\n")
    );
  }

  const messages: AIMessage[] = [
    { role: "system", content: PLANNING_PROMPT + "\n\nYou MUST respond with a valid JSON object containing \"diagnosis\" and \"plan\" keys. No markdown, no code fences, just raw JSON." },
    { role: "user", content: contextParts.join("\n") },
  ];

  const parsed = await ai.chatJSON<LLMPlanResponse>(messages, { temperature: 0.2, maxTokens: 4096 });

  // Transform to internal types
  const diagnosis: Diagnosis = {
    rootCause: parsed.diagnosis.root_cause,
    severity: parsed.diagnosis.severity,
    affectedAreas: parsed.diagnosis.affected_areas,
    correlations: parsed.diagnosis.correlations.map((c) => ({
      description: c.description,
      entities: c.entities,
      confidence: 0.8, // Base confidence, refined by memory
    })),
    recommendations: [], // Populated from plan
  };

  const steps: PlannedStep[] = parsed.plan.steps.map((s) => ({
    actionType: s.action_type,
    description: s.description,
    params: s.params as Record<string, unknown>,
    reasoning: s.reasoning,
    expectedOutcome: s.expected_outcome,
    dependsOn: s.depends_on,
  }));

  const plan: AgentPlan = {
    summary: parsed.plan.summary,
    steps,
    confidence: parsed.plan.confidence,
    rootCause: diagnosis.rootCause,
  };

  return { diagnosis, plan };
}

/**
 * Validate a plan for safety and completeness.
 * Returns validation errors if any.
 */
export function validatePlan(plan: AgentPlan): string[] {
  const errors: string[] = [];

  if (plan.steps.length === 0) {
    errors.push("Plan has no steps");
  }

  if (plan.confidence < 0.1) {
    errors.push(`Plan confidence too low: ${plan.confidence}`);
  }

  // Check for circular dependencies
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    for (const dep of step.dependsOn) {
      if (dep >= i) {
        errors.push(
          `Step ${i} depends on step ${dep} which comes after it`
        );
      }
      if (dep < 0 || dep >= plan.steps.length) {
        errors.push(
          `Step ${i} has invalid dependency index: ${dep}`
        );
      }
    }
  }

  // Validate action types
  const knownActions = [
    "jira_analyzer",
    "github_investigator",
    "slack_notifier",
  ];
  for (const step of plan.steps) {
    if (!knownActions.includes(step.actionType)) {
      errors.push(`Unknown action type: ${step.actionType}`);
    }
  }

  return errors;
}
