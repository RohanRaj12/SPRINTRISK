/**
 * Sprint Guardian — Step Classifier
 *
 * Determines whether each step in an agent plan should be:
 * - AUTO: Execute immediately without human approval
 * - APPROVAL_REQUIRED: Pause and wait for human decision
 *
 * Classification is based on:
 * 1. Action type risk profile
 * 2. Organization-level policies
 * 3. Risk level from LLM assessment
 * 4. Historical success rate for similar actions
 */

import type {
  PlannedStep,
  StepClassification,
  RiskLevel,
  MemoryEntry,
} from "./types.js";

// ── Risk Profile Configuration ──

interface ActionRiskProfile {
  /** Base risk level for this action type */
  baseRisk: RiskLevel;
  /** Classification when risk is low */
  lowRiskClassification: StepClassification;
  /** Classification when risk is medium */
  mediumRiskClassification: StepClassification;
  /** Classification when risk is high or critical */
  highRiskClassification: StepClassification;
}

const ACTION_RISK_PROFILES: Record<string, ActionRiskProfile> = {
  jira_analyzer: {
    baseRisk: "low",
    lowRiskClassification: "auto",
    mediumRiskClassification: "auto",
    highRiskClassification: "approval_required",
  },
  github_investigator: {
    baseRisk: "low",
    lowRiskClassification: "auto",
    mediumRiskClassification: "auto",
    highRiskClassification: "approval_required",
  },
  slack_notifier: {
    baseRisk: "medium",
    lowRiskClassification: "auto",
    mediumRiskClassification: "approval_required",
    highRiskClassification: "approval_required",
  },
  // ── Low-risk metadata tools (AUTO) ──
  jira_labeler: {
    baseRisk: "low",
    lowRiskClassification: "auto",
    mediumRiskClassification: "auto",
    highRiskClassification: "approval_required",
  },
  jira_commenter: {
    baseRisk: "low",
    lowRiskClassification: "auto",
    mediumRiskClassification: "auto",
    highRiskClassification: "approval_required",
  },
  github_commenter: {
    baseRisk: "medium",
    lowRiskClassification: "auto",
    mediumRiskClassification: "auto",
    highRiskClassification: "approval_required",
  },
  dependency_mapper: {
    baseRisk: "low",
    lowRiskClassification: "auto",
    mediumRiskClassification: "auto",
    highRiskClassification: "auto",
  },
  // ── High-risk write tools (always gated) ──
  jira_updater: {
    baseRisk: "high",
    lowRiskClassification: "approval_required",
    mediumRiskClassification: "approval_required",
    highRiskClassification: "approval_required",
  },
};

const DEFAULT_RISK_PROFILE: ActionRiskProfile = {
  baseRisk: "high",
  lowRiskClassification: "approval_required",
  mediumRiskClassification: "approval_required",
  highRiskClassification: "approval_required",
};

// ── Organization Policy ──

export interface OrgPolicy {
  /** If true, ALL steps require approval regardless of risk */
  requireAllApprovals: boolean;
  
  /** If true, Slack DMs always require approval */
  requireSlackDMApproval: boolean;
  
  /** Risk threshold above which approval is always required */
  approvalThreshold: RiskLevel;
  
  /** Action types that are always auto-approved */
  autoApproveActions: string[];
  
  /** Maximum number of auto steps before forcing an approval checkpoint */
  maxAutoStepsBeforeCheckpoint: number;
}

const DEFAULT_POLICY: OrgPolicy = {
  requireAllApprovals: false,
  requireSlackDMApproval: true,
  approvalThreshold: "high",
  autoApproveActions: [
    "jira_analyzer",
    "github_investigator",
    "jira_labeler",
    "jira_commenter",
    "github_commenter",
    "dependency_mapper",
  ],
  maxAutoStepsBeforeCheckpoint: 8,
};

// ── Risk Level Ordering ──

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function isRiskAboveThreshold(
  risk: RiskLevel,
  threshold: RiskLevel
): boolean {
  return RISK_ORDER[risk] >= RISK_ORDER[threshold];
}

// ── Classification Logic ──

export interface ClassifiedStep {
  step: PlannedStep;
  classification: StepClassification;
  riskLevel: RiskLevel;
  riskReasoning: string;
}

/**
 * Classify a single step based on its risk profile, org policy, and context.
 */
function classifyStep(
  step: PlannedStep,
  stepIndex: number,
  policy: OrgPolicy,
  consecutiveAutoSteps: number,
  memories: MemoryEntry[] = []
): ClassifiedStep {
  // Policy override: all steps require approval
  if (policy.requireAllApprovals) {
    return {
      step,
      classification: "approval_required",
      riskLevel: "medium",
      riskReasoning: "Organization policy requires approval for all agent actions.",
    };
  }

  const profile = ACTION_RISK_PROFILES[step.actionType] ?? DEFAULT_RISK_PROFILE;
  
  // Determine effective risk level (max of base risk and LLM-assessed risk)
  // We trust the LLM's assessment but ensure it doesn't underestimate
  const llmRisk = (step as unknown as { risk_level?: RiskLevel }).risk_level;
  const effectiveRisk: RiskLevel =
    llmRisk && RISK_ORDER[llmRisk] > RISK_ORDER[profile.baseRisk]
      ? llmRisk
      : profile.baseRisk;

  // Check if this action is in the auto-approve list
  if (policy.autoApproveActions.includes(step.actionType) && effectiveRisk !== "critical") {
    return {
      step,
      classification: "auto",
      riskLevel: effectiveRisk,
      riskReasoning: `Action "${step.actionType}" is in the auto-approve list and risk is ${effectiveRisk}.`,
    };
  }

  // Policy: Slack DMs always need approval
  if (
    policy.requireSlackDMApproval &&
    step.actionType === "slack_notifier" &&
    step.params?.developer_email
  ) {
    return {
      step,
      classification: "approval_required",
      riskLevel: "high",
      riskReasoning:
        "Direct messages to individuals require approval per organization policy.",
    };
  }

  // Force checkpoint after N consecutive auto steps
  if (consecutiveAutoSteps >= policy.maxAutoStepsBeforeCheckpoint) {
    return {
      step,
      classification: "approval_required",
      riskLevel: effectiveRisk,
      riskReasoning: `Checkpoint: ${consecutiveAutoSteps} steps executed automatically. Pausing for human review.`,
    };
  }

  // Check risk threshold
  if (isRiskAboveThreshold(effectiveRisk, policy.approvalThreshold)) {
    return {
      step,
      classification: "approval_required",
      riskLevel: effectiveRisk,
      riskReasoning: `Risk level "${effectiveRisk}" meets or exceeds the approval threshold "${policy.approvalThreshold}".`,
    };
  }

  // ── Confidence-based auto-promotion ──
  // If the memory system has high-confidence success history for this
  // exact action type, auto-promote it. This makes the agent
  // progressively more autonomous the more it runs successfully.
  const successMemories = memories.filter(
    (m) =>
      m.type === "outcome" &&
      m.key.includes(step.actionType) &&
      m.content.includes("success") &&
      m.confidence > 0.9 &&
      m.usageCount >= 5
  );

  if (successMemories.length > 0 && effectiveRisk !== "critical") {
    return {
      step,
      classification: "auto",
      riskLevel: effectiveRisk,
      riskReasoning: `Auto-promoted by confidence engine: ${successMemories.length} high-confidence success records (confidence > 0.9, usage ≥ 5).`,
    };
  }

  // Memory-based adjustment: if similar actions have failed before, require approval
  const failureMemories = memories.filter(
    (m) =>
      m.type === "outcome" &&
      m.key.includes(step.actionType) &&
      m.content.includes("failed") &&
      m.confidence > 0.7
  );

  if (failureMemories.length > 0) {
    return {
      step,
      classification: "approval_required",
      riskLevel: effectiveRisk,
      riskReasoning: `Similar actions have failed in the past (${failureMemories.length} failure records). Requiring human approval.`,
    };
  }

  // Apply risk profile classification
  let classification: StepClassification;
  if (effectiveRisk === "critical" || effectiveRisk === "high") {
    classification = profile.highRiskClassification;
  } else if (effectiveRisk === "medium") {
    classification = profile.mediumRiskClassification;
  } else {
    classification = profile.lowRiskClassification;
  }

  return {
    step,
    classification,
    riskLevel: effectiveRisk,
    riskReasoning: `Classified based on action risk profile for "${step.actionType}" at risk level "${effectiveRisk}".`,
  };
}

/**
 * Classify all steps in a plan.
 * Returns the steps with their classifications and risk assessments.
 */
export function classifyPlan(
  steps: PlannedStep[],
  orgPolicy: Partial<OrgPolicy> = {},
  memories: MemoryEntry[] = []
): ClassifiedStep[] {
  const policy: OrgPolicy = { ...DEFAULT_POLICY, ...orgPolicy };
  let consecutiveAutoSteps = 0;

  return steps.map((step, index) => {
    const classified = classifyStep(
      step,
      index,
      policy,
      consecutiveAutoSteps,
      memories
    );

    if (classified.classification === "auto") {
      consecutiveAutoSteps++;
    } else {
      consecutiveAutoSteps = 0;
    }

    return classified;
  });
}
