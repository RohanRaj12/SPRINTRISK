/**
 * Sprint Guardian — Agent Type System
 *
 * Core types for the 7-phase agent loop:
 * OBSERVE → DIAGNOSE → PLAN → CLASSIFY → EXECUTE → VERIFY → LEARN
 */

// ── Phase & Status Enums ──

export type AgentPhase =
  | "observe"
  | "diagnose"
  | "plan"
  | "classify"
  | "execute"
  | "verify"
  | "learn";

export type AgentRunStatus =
  | "pending"
  | "observing"
  | "diagnosing"
  | "planning"
  | "executing"
  | "waiting_approval"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "skipped";

export type StepClassification = "auto" | "approval_required";

export type RiskLevel = "low" | "medium" | "high" | "critical";

// ── Agent Step ──

export interface AgentStep {
  id: string;
  stepIndex: number;
  phase: AgentPhase;
  status: StepStatus;
  classification: StepClassification;

  // What this step does
  actionType: string; // e.g. 'jira_query', 'github_pr_comment', 'slack_dm'
  actionDescription: string;
  actionParams: Record<string, unknown>;

  // Risk assessment
  riskLevel: RiskLevel;
  riskReasoning?: string;

  // Results
  result?: unknown;
  errorMessage?: string;

  // Timing
  startedAt?: Date;
  completedAt?: Date;

  // Retry tracking
  retryCount: number;
  maxRetries: number;
}

// ── Agent Plan ──

export interface AgentPlan {
  /** High-level summary of what the agent will do */
  summary: string;

  /** Ordered list of steps to execute */
  steps: PlannedStep[];

  /** Confidence score from diagnosis (0.0 - 1.0) */
  confidence: number;

  /** Root cause identified during diagnosis */
  rootCause: string;

  /** Alternative approaches the agent considered */
  alternatives?: string[];
}

export interface PlannedStep {
  /** What tool/action to use */
  actionType: string;

  /** Human-readable description */
  description: string;

  /** Parameters for the tool call */
  params: Record<string, unknown>;

  /** Why this step needs to happen */
  reasoning: string;

  /** Expected outcome */
  expectedOutcome: string;

  /** Dependencies on previous steps (by index) */
  dependsOn: number[];
}

// ── Agent Run ──

export interface AgentRun {
  id: string;
  orgId: string;
  triggeredBy: string;
  status: AgentRunStatus;
  triggerType: "manual" | "scheduled" | "webhook";

  // Input/Output
  inputPrompt: string;
  finalResponse?: string;

  // Execution metadata
  modelUsed?: string;
  totalSteps: number;
  completedSteps: number;
  totalTokens: number;

  // Plan
  plan?: AgentPlan;
  steps: AgentStep[];

  // Timing
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;

  // Error tracking
  errorMessage?: string;
  retryCount: number;
}

// ── Observation Data ──

export interface ObservationData {
  jira?: {
    totalOpenIssues: number;
    staleTickets: Array<{
      key: string;
      summary: string;
      status: string;
      assignee: string;
      daysSinceUpdate: number;
      priority: string;
    }>;
  };
  github?: {
    totalOpenPRs: number;
    stalePRs: Array<{
      number: number;
      title: string;
      author: string;
      ageInDays: number;
      ciStatus: string;
      pendingReviewers: string[];
    }>;
    failingCI: Array<{
      number: number;
      title: string;
      ciStatus: string;
    }>;
  };
  slack?: {
    recentMessages?: Array<{
      channel: string;
      messageCount: number;
    }>;
  };
}

// ── Diagnosis ──

export interface Diagnosis {
  rootCause: string;
  severity: RiskLevel;
  affectedAreas: string[];
  correlations: Array<{
    description: string;
    entities: string[]; // e.g. ["ENG-402", "PR-114"]
    confidence: number;
  }>;
  recommendations: string[];
}

// ── LLM Structured Output ──

export interface LLMPlanResponse {
  diagnosis: {
    root_cause: string;
    severity: "low" | "medium" | "high" | "critical";
    affected_areas: string[];
    correlations: Array<{
      description: string;
      entities: string[];
    }>;
  };
  plan: {
    summary: string;
    confidence: number;
    steps: Array<{
      action_type: string;
      description: string;
      params: Record<string, unknown>;
      reasoning: string;
      expected_outcome: string;
      risk_level: "low" | "medium" | "high" | "critical";
      depends_on: number[];
    }>;
  };
}

// ── Memory Types ──

export type MemoryType = "pattern" | "outcome" | "preference" | "context";

export interface MemoryEntry {
  id: string;
  orgId: string;
  type: MemoryType;
  key: string;
  content: string;
  sourceRunId?: string;
  confidence: number;
  usageCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
}

// ── Approval Types ──

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "auto_approved";

export interface Approval {
  id: string;
  orgId: string;
  stepId: string;
  runId: string;

  title: string;
  description?: string;
  actionPreview: Record<string, unknown>;
  riskLevel: RiskLevel;
  riskReasoning?: string;

  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: Date;
  decisionNote?: string;

  expiresAt: Date;
  createdAt: Date;
}

// ── Audit Log Types ──

export type AuditCategory =
  | "agent"
  | "approval"
  | "integration"
  | "auth"
  | "system";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditLogEntry {
  id: string;
  orgId: string;
  userId?: string;
  runId?: string;
  stepId?: string;

  action: string;
  category: AuditCategory;
  severity: AuditSeverity;

  description: string;
  metadata: Record<string, unknown>;

  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;

  createdAt: Date;
}

// ── Agent Context (passed into each phase) ──

export interface AgentContext {
  userId: string;
  orgId: string;
  runId: string;

  // Collected data
  observations?: ObservationData;
  diagnosis?: Diagnosis;
  plan?: AgentPlan;

  // Memory
  relevantMemories: MemoryEntry[];

  // Conversation history (for multi-turn)
  conversationHistory: Array<{
    role: "user" | "agent";
    content: string;
  }>;
}
