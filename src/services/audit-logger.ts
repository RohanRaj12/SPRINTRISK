/**
 * Sprint Guardian — Audit Logger
 *
 * Immutable audit trail for every agent action, approval decision,
 * and system event. Critical for compliance, debugging, and
 * building user trust.
 *
 * Design principles:
 * - Append-only (no updates, no deletes)
 * - Structured metadata for queryability
 * - Severity-based filtering
 * - Org-scoped isolation
 */

import { randomUUID } from "node:crypto";
import type {
  AuditLogEntry,
  AuditCategory,
  AuditSeverity,
} from "../agent/types.js";

// ── In-memory store (replace with PostgreSQL in production) ──

const auditStore: AuditLogEntry[] = [];

// ── Helper ──

function generateId(): string {
  return `aud_${randomUUID()}`;
}

// ── Log Entry Creation ──

export interface LogEntryInput {
  orgId: string;
  userId?: string;
  runId?: string;
  stepId?: string;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  description: string;
  metadata?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}

/**
 * Append an audit log entry. This is a fire-and-forget operation
 * that should never block the caller.
 */
export function logAuditEvent(input: LogEntryInput): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: generateId(),
    orgId: input.orgId,
    userId: input.userId,
    runId: input.runId,
    stepId: input.stepId,
    action: input.action,
    category: input.category,
    severity: input.severity,
    description: input.description,
    metadata: input.metadata ?? {},
    beforeState: input.beforeState,
    afterState: input.afterState,
    createdAt: new Date(),
  };

  auditStore.push(entry);

  // Log to console in development
  const icon =
    input.severity === "critical"
      ? "🚨"
      : input.severity === "error"
      ? "❌"
      : input.severity === "warning"
      ? "⚠️"
      : "📝";

  console.log(
    `[Audit] ${icon} [${input.category}] ${input.action}: ${input.description}`
  );

  return entry;
}

// ── Convenience Methods ──

/**
 * Log an agent phase transition.
 */
export function logAgentPhase(
  orgId: string,
  runId: string,
  phase: string,
  description: string,
  metadata?: Record<string, unknown>
): void {
  logAuditEvent({
    orgId,
    runId,
    action: `agent.phase.${phase}`,
    category: "agent",
    severity: "info",
    description,
    metadata,
  });
}

/**
 * Log a step execution.
 */
export function logStepExecution(
  orgId: string,
  runId: string,
  stepId: string,
  actionType: string,
  success: boolean,
  metadata?: Record<string, unknown>
): void {
  logAuditEvent({
    orgId,
    runId,
    stepId,
    action: success ? "agent.step.completed" : "agent.step.failed",
    category: "agent",
    severity: success ? "info" : "error",
    description: `Step "${actionType}" ${success ? "completed successfully" : "failed"}`,
    metadata,
  });
}

/**
 * Log an approval decision.
 */
export function logApprovalDecision(
  orgId: string,
  userId: string,
  runId: string,
  stepId: string,
  decision: "approved" | "rejected",
  note?: string
): void {
  logAuditEvent({
    orgId,
    userId,
    runId,
    stepId,
    action: `approval.${decision}`,
    category: "approval",
    severity: decision === "rejected" ? "warning" : "info",
    description: `Step ${decision} by user ${userId}${note ? `: "${note}"` : ""}`,
    metadata: { decision, note },
  });
}

/**
 * Log an integration call.
 */
export function logIntegrationCall(
  orgId: string,
  userId: string,
  provider: string,
  operation: string,
  success: boolean,
  metadata?: Record<string, unknown>
): void {
  logAuditEvent({
    orgId,
    userId,
    action: `integration.${provider}.${operation}`,
    category: "integration",
    severity: success ? "info" : "error",
    description: `${provider} ${operation}: ${success ? "success" : "failed"}`,
    metadata,
  });
}

/**
 * Log a security event.
 */
export function logSecurityEvent(
  orgId: string,
  userId: string,
  action: string,
  description: string,
  severity: AuditSeverity = "warning"
): void {
  logAuditEvent({
    orgId,
    userId,
    action: `auth.${action}`,
    category: "auth",
    severity,
    description,
  });
}

// ── Query Functions ──

export interface AuditQuery {
  orgId: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  runId?: string;
  userId?: string;
  action?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Query audit logs with filters.
 */
export function queryAuditLogs(query: AuditQuery): {
  entries: AuditLogEntry[];
  total: number;
} {
  let filtered = auditStore.filter((e) => e.orgId === query.orgId);

  if (query.category) {
    filtered = filtered.filter((e) => e.category === query.category);
  }
  if (query.severity) {
    filtered = filtered.filter((e) => e.severity === query.severity);
  }
  if (query.runId) {
    filtered = filtered.filter((e) => e.runId === query.runId);
  }
  if (query.userId) {
    filtered = filtered.filter((e) => e.userId === query.userId);
  }
  if (query.action) {
    filtered = filtered.filter((e) => e.action.includes(query.action!));
  }
  if (query.fromDate) {
    filtered = filtered.filter((e) => e.createdAt >= query.fromDate!);
  }
  if (query.toDate) {
    filtered = filtered.filter((e) => e.createdAt <= query.toDate!);
  }

  // Sort by most recent first
  filtered.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  const total = filtered.length;
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  return {
    entries: filtered.slice(offset, offset + limit),
    total,
  };
}

/**
 * Get audit summary counts by category for an org.
 */
export function getAuditSummary(orgId: string): Record<AuditCategory, number> {
  const summary: Record<string, number> = {
    agent: 0,
    approval: 0,
    integration: 0,
    auth: 0,
    system: 0,
  };

  for (const entry of auditStore) {
    if (entry.orgId === orgId) {
      summary[entry.category] = (summary[entry.category] ?? 0) + 1;
    }
  }

  return summary as Record<AuditCategory, number>;
}
