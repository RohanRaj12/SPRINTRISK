/**
 * Sprint Guardian — Demo Data: Audit Log Entries
 */

import type { DashboardAuditEntry } from "../data-source.js";

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60000).toISOString();
}

export const DEMO_AUDIT_LOGS: DashboardAuditEntry[] = [
  {
    id: "aud-001",
    timestamp: minutesAgo(2),
    action: "agent.phase.learn",
    category: "agent",
    severity: "info",
    description: "Learning phase: Stored 3 new patterns and 4 outcomes from this run.",
    runId: "run-abc-123",
  },
  {
    id: "aud-002",
    timestamp: minutesAgo(4),
    action: "agent.step.failed",
    category: "agent",
    severity: "error",
    description: 'Step "slack_notifier" failed: Rate limited by Slack API. Retrying in 5s.',
    runId: "run-abc-123",
  },
  {
    id: "aud-003",
    timestamp: minutesAgo(5),
    action: "integration.slack.message_sent",
    category: "integration",
    severity: "info",
    description: "Slack DM sent to Alex regarding stale ticket ENG-402.",
    runId: "run-abc-123",
  },
  {
    id: "aud-004",
    timestamp: minutesAgo(6),
    action: "approval.approved",
    category: "approval",
    severity: "info",
    description: 'Step approved by rohan@company.com — "Looks good, send the reminder."',
    runId: "run-abc-123",
  },
  {
    id: "aud-005",
    timestamp: minutesAgo(12),
    action: "approval.requested",
    category: "approval",
    severity: "warning",
    description: "Approval required: Agent wants to send Slack DM to Alex about ENG-402.",
    runId: "run-abc-123",
  },
  {
    id: "aud-006",
    timestamp: minutesAgo(13),
    action: "agent.step.completed",
    category: "agent",
    severity: "info",
    description: 'Step "jira_analyzer" completed successfully — found 3 stale tickets.',
    runId: "run-abc-123",
  },
  {
    id: "aud-007",
    timestamp: minutesAgo(14),
    action: "agent.step.completed",
    category: "agent",
    severity: "info",
    description: 'Step "github_investigator" completed — 2 PRs with failing CI.',
    runId: "run-abc-123",
  },
  {
    id: "aud-008",
    timestamp: minutesAgo(15),
    action: "agent.run.started",
    category: "agent",
    severity: "info",
    description: 'Agent run started: "Audit sprint health for ENG project".',
    runId: "run-abc-123",
  },
  {
    id: "aud-009",
    timestamp: minutesAgo(30),
    action: "integration.github.connected",
    category: "integration",
    severity: "info",
    description: "GitHub integration connected via Auth0 Token Vault.",
  },
  {
    id: "aud-010",
    timestamp: minutesAgo(45),
    action: "integration.jira.token_refreshed",
    category: "integration",
    severity: "info",
    description: "Jira delegated token refreshed successfully.",
  },
  {
    id: "aud-011",
    timestamp: minutesAgo(120),
    action: "auth.login",
    category: "auth",
    severity: "info",
    description: "User rohan@company.com logged in via Auth0.",
  },
  {
    id: "aud-012",
    timestamp: minutesAgo(180),
    action: "agent.run.completed",
    category: "agent",
    severity: "info",
    description: "Previous agent run completed: 5 steps executed, 2 approvals granted.",
    runId: "run-prev-789",
  },
];
