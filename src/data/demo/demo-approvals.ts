/**
 * Sprint Guardian — Demo Data: Approvals
 */

import type { DashboardApproval } from "../data-source.js";

export const DEMO_APPROVALS: DashboardApproval[] = [
  {
    id: "apv-001",
    title: "Send Slack DM to Alex about stale ticket ENG-402",
    description:
      "The agent wants to send a direct message to Alex (alex@company.com) notifying them that ticket ENG-402 hasn't been updated in 4 days and has a failing CI on PR #114.",
    riskLevel: "high",
    riskReasoning:
      "Direct messages to individuals require approval per organization policy.",
    actionPreview: {
      tool: "slack_notifier",
      target: "alex@company.com (DM)",
      action: "Send Direct Message",
      parameters: {
        severity: "warning",
        message:
          'Hey Alex — ENG-402 "Implement Token Vault caching layer" hasn\'t been updated in 4 days. PR #114 is also failing CI on the typecheck step. Can you take a look?',
      },
    },
    runId: "run-abc-123",
    requestedAt: new Date(Date.now() - 30 * 60000).toISOString(),
    expiresAt: new Date(Date.now() + 23.5 * 3600000).toISOString(),
    status: "pending",
    agentReasoning:
      "ENG-402 is correlated with failing PR #114. Both are assigned to Alex. A direct DM is the fastest way to unblock this work.",
  },
  {
    id: "apv-002",
    title: "Post sprint health summary to #engineering",
    description:
      "The agent wants to post a comprehensive sprint health report to the #engineering Slack channel summarizing 3 stale tickets and 2 failing CI checks.",
    riskLevel: "medium",
    riskReasoning:
      'Checkpoint: 5 steps executed automatically. Pausing for human review.',
    actionPreview: {
      tool: "slack_notifier",
      target: "#engineering (Channel)",
      action: "Post Message",
      parameters: {
        severity: "warning",
        message:
          "📊 Sprint Health Report: 3 stale tickets, 2 failing CIs, 1 PR blocked on review...",
      },
    },
    runId: "run-abc-123",
    requestedAt: new Date(Date.now() - 28 * 60000).toISOString(),
    expiresAt: new Date(Date.now() + 23.5 * 3600000).toISOString(),
    status: "pending",
    agentReasoning:
      "Sprint has multiple issues that the team should be aware of. Posting to the engineering channel ensures visibility.",
  },
  {
    id: "apv-003",
    title: "Request review ping for stale PR #119",
    description:
      "The agent wants to DM Morgan about PR #119 which has been awaiting review for 3 days from 2 reviewers.",
    riskLevel: "medium",
    riskReasoning:
      'Risk level "medium" meets the approval threshold for Slack DMs.',
    actionPreview: {
      tool: "slack_notifier",
      target: "morgan@company.com (DM)",
      action: "Send Direct Message",
      parameters: {
        severity: "info",
        message:
          "Hey Morgan — your PR #119 has been waiting on reviews from Sam and Jordan for 3 days. Would you like me to ping them?",
      },
    },
    runId: "run-def-456",
    requestedAt: new Date(Date.now() - 105 * 60000).toISOString(),
    expiresAt: new Date(Date.now() + 22.25 * 3600000).toISOString(),
    status: "pending",
    agentReasoning:
      "PR #119 is a review bottleneck. Notifying the author is a low-friction way to unblock it.",
  },
];
