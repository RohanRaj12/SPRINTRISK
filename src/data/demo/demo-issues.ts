/**
 * Sprint Guardian — Demo Data: Sprint Issues
 */

import type { SprintIssue } from "../data-source.js";

export const DEMO_ISSUES: SprintIssue[] = [
  {
    id: "ENG-402",
    title: "Implement Token Vault caching layer",
    assignee: "Alex",
    status: "stale",
    daysStale: 4,
    provider: "jira",
    aiInsight:
      "This ticket hasn't moved in 4 days. The associated PR #114 is failing CI on the typecheck step.",
  },
  {
    id: "PR-118",
    title: "Fix auth race condition in React router",
    assignee: "Sam",
    status: "review",
    provider: "github",
    aiInsight:
      "PR is approved but needs merge conflict resolution before it can be deployed.",
  },
  {
    id: "ENG-399",
    title: "Design system dark mode implementation",
    assignee: "Taylor",
    status: "blocked",
    daysStale: 2,
    provider: "jira",
    aiInsight:
      "Blocked waiting on final color palette approval from product team.",
  },
  {
    id: "ENG-405",
    title: "Update Next.js to v15",
    assignee: "Jordan",
    status: "healthy",
    provider: "jira",
  },
  {
    id: "PR-121",
    title: "Add rate limiting to API gateway",
    assignee: "Morgan",
    status: "review",
    provider: "github",
    aiInsight:
      "PR has been awaiting review for 3 days from 2 reviewers.",
  },
  {
    id: "ENG-410",
    title: "Migrate user preferences to PostgreSQL",
    assignee: "Riley",
    status: "healthy",
    provider: "jira",
  },
];
