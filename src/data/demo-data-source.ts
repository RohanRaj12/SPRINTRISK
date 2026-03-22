/**
 * Sprint Guardian — Demo DataSource Implementation
 *
 * Returns static fixture data. Every response is clearly labeled source: "demo".
 * This is ONLY used when demo mode is explicitly toggled ON.
 */

import type {
  DataSource,
  SprintIssue,
  PRItem,
  DashboardApproval,
  DashboardAuditEntry,
  IntegrationStatus,
} from "./data-source.js";
import {
  DEMO_ISSUES,
  DEMO_APPROVALS,
  DEMO_AUDIT_LOGS,
  DEMO_INTEGRATIONS,
} from "./demo/index.js";

export class DemoDataSource implements DataSource {
  readonly source = "demo" as const;

  async getSprintIssues(_userId: string): Promise<SprintIssue[]> {
    return DEMO_ISSUES;
  }

  async getGithubPRs(_userId: string): Promise<PRItem[]> {
    // Convert demo issues that are from GitHub into PR format
    return DEMO_ISSUES.filter((i) => i.provider === "github").map((i) => ({
      number: parseInt(i.id.replace("PR-", ""), 10) || 0,
      title: i.title,
      author: i.assignee,
      status: "open" as const,
      ageInDays: i.daysStale ?? 1,
      ciStatus: i.status === "blocked" ? "❌ failing" : "✅ passing",
      url: `https://github.com/acme-corp/demo-repo/pull/${i.id.replace("PR-", "")}`,
      pendingReviewers: ["reviewer-1"],
      labels: [],
    }));
  }

  async getApprovals(_orgId: string): Promise<DashboardApproval[]> {
    return DEMO_APPROVALS;
  }

  async getAuditLogs(_orgId: string): Promise<DashboardAuditEntry[]> {
    return DEMO_AUDIT_LOGS;
  }

  async getIntegrationStatus(_userId: string): Promise<IntegrationStatus[]> {
    return DEMO_INTEGRATIONS;
  }
}
