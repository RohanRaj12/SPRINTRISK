/**
 * Sprint Guardian — Policy Engine
 *
 * Evaluates agent actions against organizational policies
 * and security guardrails. Determines risk levels and
 * whether actions require human approval.
 */

import type {
  RiskLevel,
  StepClassification,
  PlannedStep,
} from "../agent/types.js";

// ── Policy Rule Types ──

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  condition: (step: PlannedStep, context: PolicyContext) => boolean;
  effectRisk: RiskLevel;
  effectClassification: StepClassification;
  priority: number; // Higher priority rules override lower ones
}

export interface PolicyContext {
  orgId: string;
  userId: string;
  orgPlan: "free" | "pro" | "enterprise";
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0-6 (Sunday=0)
  recentFailureCount: number;
}

export interface PolicyEvaluation {
  riskLevel: RiskLevel;
  classification: StepClassification;
  appliedRules: string[];
  reasoning: string[];
}

// ── Built-in Policy Rules ──

const BUILT_IN_RULES: PolicyRule[] = [
  {
    id: "read-only-auto",
    name: "Auto-approve read-only operations",
    description: "Read-only queries against Jira and GitHub are always safe",
    condition: (step) =>
      ["jira_analyzer", "github_investigator"].includes(step.actionType),
    effectRisk: "low",
    effectClassification: "auto",
    priority: 10,
  },
  {
    id: "dm-requires-approval",
    name: "Direct messages require approval",
    description: "Sending DMs to individuals should be reviewed by a human",
    condition: (step) =>
      step.actionType === "slack_notifier" &&
      !!step.params?.developer_email,
    effectRisk: "high",
    effectClassification: "approval_required",
    priority: 50,
  },
  {
    id: "channel-notification-medium",
    name: "Channel notifications are medium risk",
    description: "Posting to a channel is less risky than DMs but still visible",
    condition: (step) =>
      step.actionType === "slack_notifier" &&
      !!step.params?.channel &&
      !step.params?.developer_email,
    effectRisk: "medium",
    effectClassification: "auto",
    priority: 20,
  },
  {
    id: "off-hours-escalation",
    name: "Off-hours action escalation",
    description: "Actions outside business hours (9 AM - 6 PM) get elevated risk",
    condition: (_step, ctx) =>
      ctx.timeOfDay < 9 || ctx.timeOfDay >= 18,
    effectRisk: "high",
    effectClassification: "approval_required",
    priority: 40,
  },
  {
    id: "weekend-block",
    name: "Weekend notification block",
    description: "Notifications should not be sent on weekends without approval",
    condition: (step, ctx) =>
      step.actionType === "slack_notifier" &&
      (ctx.dayOfWeek === 0 || ctx.dayOfWeek === 6),
    effectRisk: "high",
    effectClassification: "approval_required",
    priority: 60,
  },
  {
    id: "failure-escalation",
    name: "Recent failure escalation",
    description: "If there have been recent failures, require approval for all actions",
    condition: (_step, ctx) => ctx.recentFailureCount >= 3,
    effectRisk: "high",
    effectClassification: "approval_required",
    priority: 70,
  },
  {
    id: "critical-notification-approval",
    name: "Critical severity requires approval",
    description: "Critical-severity Slack notifications require human review",
    condition: (step) =>
      step.actionType === "slack_notifier" &&
      step.params?.severity === "critical",
    effectRisk: "critical",
    effectClassification: "approval_required",
    priority: 80,
  },
];

// ── Risk Level Ordering ──

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Evaluate a step against all policy rules.
 * Returns the highest-priority matching evaluation.
 */
export function evaluatePolicy(
  step: PlannedStep,
  context: PolicyContext,
  customRules: PolicyRule[] = []
): PolicyEvaluation {
  const allRules = [...BUILT_IN_RULES, ...customRules].sort(
    (a, b) => b.priority - a.priority // Highest priority first
  );

  const matchedRules: PolicyRule[] = [];
  
  for (const rule of allRules) {
    if (rule.condition(step, context)) {
      matchedRules.push(rule);
    }
  }

  if (matchedRules.length === 0) {
    return {
      riskLevel: "medium",
      classification: "approval_required",
      appliedRules: [],
      reasoning: ["No policy rules matched. Defaulting to approval_required."],
    };
  }

  // Highest risk level among matched rules
  let maxRisk: RiskLevel = "low";
  let requiresApproval = false;

  for (const rule of matchedRules) {
    if (RISK_ORDER[rule.effectRisk] > RISK_ORDER[maxRisk]) {
      maxRisk = rule.effectRisk;
    }
    if (rule.effectClassification === "approval_required") {
      requiresApproval = true;
    }
  }

  return {
    riskLevel: maxRisk,
    classification: requiresApproval ? "approval_required" : "auto",
    appliedRules: matchedRules.map((r) => r.id),
    reasoning: matchedRules.map((r) => `[${r.id}] ${r.description}`),
  };
}

/**
 * Create a policy context from request metadata.
 */
export function createPolicyContext(
  orgId: string,
  userId: string,
  orgPlan: "free" | "pro" | "enterprise",
  recentFailureCount: number = 0
): PolicyContext {
  const now = new Date();
  return {
    orgId,
    userId,
    orgPlan,
    timeOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
    recentFailureCount,
  };
}
