/**
 * Sprint Guardian — Approval Service
 *
 * Manages the human-in-the-loop approval queue.
 * Handles:
 * - Creating approval requests when steps require human review
 * - Polling for approval decisions
 * - Resuming agent execution after approval/rejection
 * - Expiring stale approvals
 *
 * State machine: PENDING → APPROVED/REJECTED → EXECUTED/EXPIRED
 */

import { randomUUID } from "node:crypto";
import type {
  Approval,
  ApprovalStatus,
  AgentStep,
  RiskLevel,
} from "../agent/types.js";

// ── In-memory store (replace with PostgreSQL in production) ──

const approvalStore = new Map<string, Approval>();
const approvalListeners = new Map<
  string,
  Array<(approval: Approval) => void>
>();

// ── Helper: generate ID ──

function generateId(): string {
  return `apv_${randomUUID()}`;
}

// ── Approval Creation ──

export interface CreateApprovalRequest {
  orgId: string;
  stepId: string;
  runId: string;
  title: string;
  description?: string;
  actionPreview: Record<string, unknown>;
  riskLevel: RiskLevel;
  riskReasoning?: string;
  ttlHours?: number; // Default: 24 hours
}

/**
 * Create a new approval request and add it to the queue.
 */
export function createApproval(req: CreateApprovalRequest): Approval {
  const ttlMs = (req.ttlHours ?? 24) * 60 * 60 * 1000;

  const approval: Approval = {
    id: generateId(),
    orgId: req.orgId,
    stepId: req.stepId,
    runId: req.runId,
    title: req.title,
    description: req.description,
    actionPreview: req.actionPreview,
    riskLevel: req.riskLevel,
    riskReasoning: req.riskReasoning,
    status: "pending",
    expiresAt: new Date(Date.now() + ttlMs),
    createdAt: new Date(),
  };

  approvalStore.set(approval.id, approval);

  console.log(
    `[Approval] Created approval ${approval.id} for step ${req.stepId} ` +
    `(risk: ${req.riskLevel}, expires: ${approval.expiresAt.toISOString()})`
  );

  return approval;
}

// ── Approval Decision ──

export interface ApprovalDecision {
  approvalId: string;
  decidedBy: string; // User ID who made the decision
  status: "approved" | "rejected";
  note?: string;
}

/**
 * Record an approval decision.
 * Notifies any listeners waiting for this approval.
 */
export function decideApproval(decision: ApprovalDecision): Approval {
  const approval = approvalStore.get(decision.approvalId);
  if (!approval) {
    throw new Error(`Approval not found: ${decision.approvalId}`);
  }

  if (approval.status !== "pending") {
    throw new Error(
      `Approval ${decision.approvalId} is already ${approval.status}`
    );
  }

  // Check expiration
  if (new Date() > approval.expiresAt) {
    approval.status = "expired";
    approvalStore.set(approval.id, approval);
    throw new Error(
      `Approval ${decision.approvalId} has expired`
    );
  }

  // Apply decision
  approval.status = decision.status;
  approval.decidedBy = decision.decidedBy;
  approval.decidedAt = new Date();
  approval.decisionNote = decision.note;

  approvalStore.set(approval.id, approval);

  console.log(
    `[Approval] Decision: ${decision.status} on ${approval.id} ` +
    `by user ${decision.decidedBy}` +
    (decision.note ? ` — "${decision.note}"` : "")
  );

  // Notify listeners
  const listeners = approvalListeners.get(approval.id) ?? [];
  for (const listener of listeners) {
    listener(approval);
  }
  approvalListeners.delete(approval.id);

  return approval;
}

// ── Polling & Waiting ──

/**
 * Wait for an approval decision.
 * Resolves when the approval is decided or expires.
 *
 * @param approvalId - The approval to wait for
 * @param timeoutMs - Maximum wait time (default: 5 minutes for polling)
 */
export function waitForApproval(
  approvalId: string,
  timeoutMs: number = 5 * 60 * 1000
): Promise<Approval> {
  return new Promise((resolve, reject) => {
    const approval = approvalStore.get(approvalId);
    if (!approval) {
      return reject(new Error(`Approval not found: ${approvalId}`));
    }

    // Already decided?
    if (approval.status !== "pending") {
      return resolve(approval);
    }

    // Set up listener
    const listeners = approvalListeners.get(approvalId) ?? [];
    listeners.push(resolve);
    approvalListeners.set(approvalId, listeners);

    // Timeout
    setTimeout(() => {
      approvalListeners.delete(approvalId);
      const current = approvalStore.get(approvalId);
      if (current && current.status === "pending") {
        reject(
          new Error(
            `Approval ${approvalId} timed out waiting for decision`
          )
        );
      } else if (current) {
        resolve(current);
      }
    }, timeoutMs);
  });
}

// ── Query Functions ──

/**
 * Get all pending approvals for an organization.
 */
export function getPendingApprovals(orgId: string): Approval[] {
  const now = new Date();
  const approvals: Approval[] = [];

  for (const approval of approvalStore.values()) {
    if (approval.orgId !== orgId) continue;

    // Auto-expire stale approvals
    if (approval.status === "pending" && now > approval.expiresAt) {
      approval.status = "expired";
      approvalStore.set(approval.id, approval);
      continue;
    }

    if (approval.status === "pending") {
      approvals.push(approval);
    }
  }

  return approvals.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * Get all approvals for an organization, optionally filtered by status.
 */
export function getApprovals(
  orgId: string,
  status?: ApprovalStatus
): Approval[] {
  const approvals: Approval[] = [];

  for (const approval of approvalStore.values()) {
    if (approval.orgId !== orgId) continue;
    if (status && approval.status !== status) continue;
    approvals.push(approval);
  }

  return approvals.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * Get a single approval by ID.
 */
export function getApprovalById(id: string): Approval | undefined {
  return approvalStore.get(id);
}

/**
 * Get approvals for a specific agent run.
 */
export function getApprovalsByRunId(runId: string): Approval[] {
  const approvals: Approval[] = [];

  for (const approval of approvalStore.values()) {
    if (approval.runId === runId) {
      approvals.push(approval);
    }
  }

  return approvals.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
}
