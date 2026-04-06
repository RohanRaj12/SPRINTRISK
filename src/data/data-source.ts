/**
 * Sprint Guardian — DataSource Abstraction
 *
 * Core interfaces defining the data contract for all dashboard data.
 * Every data consumer goes through this interface, whether the source
 * is real (Token Vault APIs) or demo (static fixtures).
 */

// ── Shared Types ──

export interface SprintIssue {
  id: string;
  title: string;
  assignee: string;
  status: "stale" | "healthy" | "blocked" | "review";
  daysStale?: number;
  provider: "jira" | "github";
  aiInsight?: string;
  priority?: string;
  issueType?: string;
  url?: string;
}

export interface PRItem {
  number: number;
  title: string;
  author: string;
  status: "open" | "draft" | "review" | "approved" | "changes_requested";
  ageInDays: number;
  ciStatus: string;
  url: string;
  pendingReviewers: string[];
  labels: string[];
}

export interface DashboardApproval {
  id: string;
  title: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskReasoning: string;
  actionPreview: {
    tool: string;
    target: string;
    action: string;
    parameters: Record<string, string>;
  };
  runId: string;
  requestedAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "rejected" | "expired";
  agentReasoning: string;
}

export interface DashboardAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  category: "agent" | "approval" | "integration" | "auth" | "system";
  severity: "info" | "warning" | "error" | "critical";
  description: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export interface IntegrationStatus {
  provider: "jira" | "github" | "slack";
  displayName: string;
  description: string;
  status: "connected" | "disconnected" | "error";
  account?: string;
  lastSync?: string;
  scopes?: string[];
  error?: string;
}

// ── DataSource Interface ──

export interface DataSource {
  readonly source: "live" | "demo";

  getSprintIssues(userId: string): Promise<SprintIssue[]>;
  getGithubPRs(userId: string): Promise<PRItem[]>;
  getApprovals(orgId: string): Promise<DashboardApproval[]>;
  getAuditLogs(orgId: string): Promise<DashboardAuditEntry[]>;
  getIntegrationStatus(userId: string): Promise<IntegrationStatus[]>;
}

// ── Response Wrapper (always includes source) ──

export interface DataResponse<T> {
  data: T;
  source: "live" | "demo";
  timestamp: string;
  warnings?: string[];
}

export function wrapResponse<T>(
  data: T,
  source: "live" | "demo",
  warnings?: string[]
): DataResponse<T> {
  const resp: DataResponse<T> = { data, source, timestamp: new Date().toISOString() };
  if (warnings && warnings.length > 0) {
    resp.warnings = warnings;
  }
  return resp;
}
