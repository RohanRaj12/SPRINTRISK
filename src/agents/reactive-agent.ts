/**
 * Sprint Guardian — Reactive Agent
 *
 * Autonomous agent that reacts to real-time events from GitHub, Jira, and Slack.
 * No human-in-the-loop for routine decisions — the agent decides and acts.
 *
 * Event types handled:
 *   GitHub: PR opened, CI failure, push to main, review requested
 *   Jira:   Issue updated, status changed, issue created, sprint started
 *   Slack:  App mention (future)
 *
 * Autonomous behaviors:
 *   1. CI Failure → Notify Slack + add "ci-broken" label on PR + comment on PR
 *   2. Stale PR detected → DM author via Slack + add "needs-attention" label
 *   3. Jira blocker created → Escalate to Slack channel + cross-reference with GitHub
 *   4. Sprint health degradation → Proactive Slack alert with diagnosis
 *   5. PR opened → Auto-check for linked Jira ticket + CI expectations
 *   6. Jira status regression → Alert + comment on ticket
 */

import { getGitHubClient } from "../integrations/github-client.js";
import { getSlackClient } from "../integrations/slack-client.js";
import { getJiraClient } from "../integrations/jira-client.js";
import { getConnectionManager } from "../integrations/connection-manager.js";
import { emitNotification } from "../routes/events.js";
import { config } from "../config.js";

// ── Types ──

export interface WebhookEvent {
  source: "github" | "jira" | "slack";
  eventType: string;
  action?: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export interface AgentAction {
  id: string;
  trigger: string;
  actions: string[];
  timestamp: string;
  success: boolean;
  details?: string;
}

// ── Action Log ──
const recentActions: AgentAction[] = [];
const MAX_ACTION_LOG = 100;

function logAction(action: AgentAction): void {
  recentActions.unshift(action);
  if (recentActions.length > MAX_ACTION_LOG) {
    recentActions.pop();
  }
}

export function getRecentActions(limit = 20): AgentAction[] {
  return recentActions.slice(0, limit);
}

// ── Reactive Agent ──

/**
 * Process an incoming webhook event and take autonomous actions.
 * Returns a list of actions taken.
 */
export async function processEvent(event: WebhookEvent): Promise<string[]> {
  const actions: string[] = [];

  try {
    switch (event.source) {
      case "github":
        actions.push(...(await handleGitHubEvent(event)));
        break;
      case "jira":
        actions.push(...(await handleJiraEvent(event)));
        break;
      case "slack":
        actions.push(...(await handleSlackEvent(event)));
        break;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ReactiveAgent] Error processing ${event.source}/${event.eventType}:`, errorMsg);
    actions.push(`Error: ${errorMsg}`);
  }

  logAction({
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    trigger: `${event.source}/${event.eventType}${event.action ? `/${event.action}` : ""}`,
    actions,
    timestamp: new Date().toISOString(),
    success: !actions.some((a) => a.startsWith("Error:")),
  });

  return actions;
}

// ── GitHub Event Handlers ──

async function handleGitHubEvent(event: WebhookEvent): Promise<string[]> {
  const actions: string[] = [];
  const payload = event.payload;
  const github = getGitHubClient();
  const slack = getSlackClient();
  const slackChannel = config.slack.defaultChannel;

  switch (event.eventType) {
    case "pull_request": {
      const pr = payload.pull_request as Record<string, unknown> | undefined;
      const repo = payload.repository as Record<string, unknown> | undefined;
      const action = event.action;

      if (!pr || !repo) break;

      const prNumber = pr.number as number;
      const prTitle = pr.title as string;
      const prAuthor = (pr.user as Record<string, unknown>)?.login as string;
      const repoName = repo.full_name as string;
      const owner = (repo.owner as Record<string, unknown>)?.login as string;
      const repoShort = repo.name as string;

      if (action === "opened" || action === "reopened") {
        // Check for linked Jira ticket in PR title/branch
        const headRef = (pr.head as Record<string, unknown>)?.ref as string;
        const jiraKeyMatch = (prTitle + " " + headRef).match(/([A-Z]{2,10}-\d+)/);

        if (jiraKeyMatch) {
          const jiraKey = jiraKeyMatch[1];
          actions.push(`Detected linked Jira ticket: ${jiraKey} in PR #${prNumber}`);

          // Verify the Jira ticket exists
          const jira = getJiraClient();
          if (jira) {
            try {
              const issue = await jira.getIssue(jiraKey);
              const comment = `Sprint Guardian detected this PR is linked to [${jiraKey}] (${issue.fields.summary}). Status: ${issue.fields.status.name}`;
              if (github) {
                await github.createIssueComment(owner, repoShort, prNumber, comment);
                actions.push(`Commented on PR #${prNumber} with Jira link`);
              }
            } catch {
              actions.push(`Jira ticket ${jiraKey} not found or inaccessible`);
            }
          }
        } else {
          // No Jira ticket found — warn
          if (github) {
            await github.createIssueComment(
              owner,
              repoShort,
              prNumber,
              "Sprint Guardian: No Jira ticket detected in this PR title or branch name. Consider linking a ticket for traceability."
            );
            actions.push(`Warned PR #${prNumber} about missing Jira link`);
          }
        }

        // Notify Slack about new PR
        if (slack && slackChannel) {
          await slack.postSprintAlert(slackChannel, "info", "New PR Opened", [
            `*<${pr.html_url}|#${prNumber}: ${prTitle}>*`,
            `Author: ${prAuthor} | Repo: ${repoName}`,
            jiraKeyMatch ? `Linked: ${jiraKeyMatch[1]}` : "_No Jira ticket linked_",
          ].join("\n"));
          actions.push(`Notified Slack about new PR #${prNumber}`);
        }
      }

      if (action === "review_requested") {
        const reviewer = (payload.requested_reviewer as Record<string, unknown>)?.login as string;
        if (slack && slackChannel) {
          await slack.postSprintAlert(slackChannel, "info", "Review Requested", [
            `*<${pr.html_url}|#${prNumber}: ${prTitle}>*`,
            `Reviewer: @${reviewer} | Author: ${prAuthor}`,
          ].join("\n"));
          actions.push(`Notified Slack about review request for PR #${prNumber}`);
        }
      }

      break;
    }

    case "check_run":
    case "check_suite": {
      const checkRun = (payload.check_run ?? payload.check_suite) as Record<string, unknown> | undefined;
      const repo = payload.repository as Record<string, unknown> | undefined;
      if (!checkRun || !repo) break;

      const conclusion = checkRun.conclusion as string;
      const repoName = repo.full_name as string;
      const owner = (repo.owner as Record<string, unknown>)?.login as string;
      const repoShort = repo.name as string;

      if (conclusion === "failure") {
        actions.push(`CI failure detected in ${repoName}`);

        // Find the PR associated with this check
        const pullRequests = (checkRun.pull_requests ?? []) as Array<Record<string, unknown>>;
        for (const pr of pullRequests) {
          const prNumber = pr.number as number;

          // Add label
          if (github) {
            try {
              await github.addLabels(owner, repoShort, prNumber, ["ci-broken"]);
              actions.push(`Added "ci-broken" label to PR #${prNumber}`);
            } catch {
              // Label may already exist
            }

            // Comment on PR
            const checkName = (checkRun.name ?? (checkRun.app as Record<string, unknown>)?.name ?? "CI") as string;
            await github.createIssueComment(
              owner,
              repoShort,
              prNumber,
              `Sprint Guardian: CI check "${checkName}" failed. Please investigate and fix before merging.`
            );
            actions.push(`Commented on PR #${prNumber} about CI failure`);
          }
        }

        // Alert Slack
        if (slack && slackChannel) {
          const checkName = (checkRun.name ?? "CI") as string;
          await slack.postSprintAlert(slackChannel, "critical", "CI Failure Detected", [
            `*Repository:* ${repoName}`,
            `*Check:* ${checkName}`,
            pullRequests.length > 0
              ? `*Affected PRs:* ${pullRequests.map((p) => `#${p.number}`).join(", ")}`
              : "*No PRs directly affected*",
            "_Sprint Guardian is monitoring this._",
          ].join("\n"));
          actions.push("Alerted Slack about CI failure");
        }

        emitNotification("audit_finding", {
          source: "github",
          type: "ci_failure",
          repo: repoName,
          severity: "critical",
          message: `CI failure in ${repoName}`,
        });
      }

      break;
    }

    case "push": {
      const repo = payload.repository as Record<string, unknown> | undefined;
      const ref = payload.ref as string;
      const commits = (payload.commits ?? []) as Array<Record<string, unknown>>;

      if (!repo || !ref) break;

      const repoName = repo.full_name as string;
      const defaultBranch = repo.default_branch as string;
      const isMainBranch = ref === `refs/heads/${defaultBranch}` || ref === "refs/heads/main" || ref === "refs/heads/master";

      if (isMainBranch && commits.length > 0) {
        // Notify Slack about push to main
        if (slack && slackChannel) {
          const pusher = (payload.pusher as Record<string, unknown>)?.name as string;
          await slack.postSprintAlert(slackChannel, "info", `Push to ${defaultBranch}`, [
            `*Repo:* ${repoName}`,
            `*Pusher:* ${pusher}`,
            `*Commits:* ${commits.length}`,
            commits.slice(0, 3).map((c) => `  - ${(c.message as string)?.split("\n")[0]}`).join("\n"),
            commits.length > 3 ? `  ... and ${commits.length - 3} more` : "",
          ].join("\n"));
          actions.push(`Notified Slack about push to ${defaultBranch}`);
        }
      }

      break;
    }
  }

  return actions;
}

// ── Jira Event Handlers ──

async function handleJiraEvent(event: WebhookEvent): Promise<string[]> {
  const actions: string[] = [];
  const payload = event.payload;
  const slack = getSlackClient();
  const slackChannel = config.slack.defaultChannel;
  const github = getGitHubClient();

  const webhookEvent = payload.webhookEvent as string ?? event.eventType;
  const issue = payload.issue as Record<string, unknown> | undefined;

  if (!issue) return actions;

  const issueKey = issue.key as string;
  const fields = issue.fields as Record<string, unknown>;
  const summary = fields?.summary as string;
  const status = (fields?.status as Record<string, unknown>)?.name as string;
  const priority = (fields?.priority as Record<string, unknown>)?.name as string;
  const assignee = (fields?.assignee as Record<string, unknown>)?.displayName as string ?? "Unassigned";

  switch (webhookEvent) {
    case "jira:issue_updated": {
      const changelog = payload.changelog as Record<string, unknown> | undefined;
      const items = (changelog?.items ?? []) as Array<Record<string, unknown>>;

      for (const item of items) {
        const field = item.field as string;
        const fromString = item["fromString"] as string;
        const toString = item["toString"] as string;

        // Status transition
        if (field === "status") {
          actions.push(`${issueKey}: Status changed from "${fromString}" to "${toString}"`);

          // Detect regression (moving backwards)
          const progressionOrder = ["To Do", "In Progress", "In Review", "Done"];
          const fromIdx = progressionOrder.indexOf(fromString);
          const toIdx = progressionOrder.indexOf(toString);

          if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
            // Regression detected!
            actions.push(`REGRESSION: ${issueKey} moved backwards from "${fromString}" to "${toString}"`);

            if (slack && slackChannel) {
              await slack.postSprintAlert(slackChannel, "warning", "Ticket Regression Detected", [
                `*<https://${config.jira.host}/browse/${issueKey}|${issueKey}>*: ${summary}`,
                `*Status:* "${fromString}" → "${toString}"`,
                `*Assignee:* ${assignee}`,
                "_This ticket moved backwards in the workflow. Possible re-opened bug or blocked work._",
              ].join("\n"));
              actions.push("Alerted Slack about regression");
            }

            emitNotification("audit_finding", {
              source: "jira",
              type: "regression",
              issueKey,
              severity: "warning",
              message: `${issueKey} regressed from "${fromString}" to "${toString}"`,
            });
          }
        }

        // Priority escalation
        if (field === "priority") {
          const priorityOrder = ["Lowest", "Low", "Medium", "High", "Highest"];
          const fromPrio = priorityOrder.indexOf(fromString);
          const toPrio = priorityOrder.indexOf(toString);

          if (toPrio > fromPrio && toPrio >= 3) {
            // Escalated to High or above
            actions.push(`${issueKey}: Priority escalated to ${toString}`);

            if (slack && slackChannel) {
              await slack.postSprintAlert(slackChannel, "warning", "Priority Escalation", [
                `*<https://${config.jira.host}/browse/${issueKey}|${issueKey}>*: ${summary}`,
                `*Priority:* ${fromString} → *${toString}*`,
                `*Assignee:* ${assignee}`,
              ].join("\n"));
              actions.push("Alerted Slack about priority escalation");
            }
          }
        }
      }

      break;
    }

    case "jira:issue_created": {
      // Check if it's a blocker
      if (priority === "Blocker" || priority === "Highest") {
        actions.push(`High-priority issue created: ${issueKey} (${priority})`);

        if (slack && slackChannel) {
          await slack.postSprintAlert(slackChannel, "critical", "Blocker Created", [
            `*<https://${config.jira.host}/browse/${issueKey}|${issueKey}>*: ${summary}`,
            `*Priority:* ${priority}`,
            `*Assignee:* ${assignee}`,
            "_This requires immediate attention._",
          ].join("\n"));
          actions.push("Alerted Slack about new blocker");
        }

        // Cross-reference with GitHub — check if there are related PRs
        if (github && config.github.defaultOwner && config.github.defaultRepo) {
          try {
            const prs = await github.listPullRequests(
              config.github.defaultOwner,
              config.github.defaultRepo
            );
            const relatedPRs = prs.filter(
              (pr) => pr.title.includes(issueKey) || pr.head.ref.includes(issueKey)
            );

            if (relatedPRs.length > 0) {
              actions.push(`Found ${relatedPRs.length} related PR(s) for ${issueKey}`);
              // Comment on the Jira ticket
              const jira = getJiraClient();
              if (jira) {
                const prList = relatedPRs
                  .map((pr) => `- PR #${pr.number}: ${pr.title} (${pr.state})`)
                  .join("\n");
                await jira.addComment(
                  issueKey,
                  `Sprint Guardian found related GitHub PRs:\n${prList}`
                );
                actions.push(`Commented on ${issueKey} with related PR info`);
              }
            }
          } catch {
            // Non-critical, skip
          }
        }

        emitNotification("audit_finding", {
          source: "jira",
          type: "blocker_created",
          issueKey,
          severity: "critical",
          message: `Blocker ${issueKey}: ${summary}`,
        });
      }

      break;
    }
  }

  return actions;
}

// ── Slack Event Handlers ──

async function handleSlackEvent(event: WebhookEvent): Promise<string[]> {
  const actions: string[] = [];
  // Future: Handle app_mention events to respond to direct queries
  // Future: Handle message events for keyword-based alerts
  return actions;
}

// ── Proactive Sprint Health Check ──

/**
 * Run a proactive sprint health check across all connected services.
 * Called periodically or on demand — fully autonomous.
 */
export async function runProactiveHealthCheck(): Promise<{
  findings: string[];
  actionsCount: number;
}> {
  const findings: string[] = [];
  let actionsCount = 0;
  const slack = getSlackClient();
  const slackChannel = config.slack.defaultChannel;
  const github = getGitHubClient();
  const jira = getJiraClient();

  // Check GitHub for stale PRs
  if (github && config.github.defaultOwner && config.github.defaultRepo) {
    try {
      const prs = await github.listPullRequests(
        config.github.defaultOwner,
        config.github.defaultRepo
      );
      const now = Date.now();
      const stalePRs = prs.filter(
        (pr) =>
          !pr.draft &&
          (now - new Date(pr.updated_at).getTime()) / (1000 * 60 * 60 * 24) > 3
      );

      if (stalePRs.length > 0) {
        findings.push(`${stalePRs.length} stale PR(s) detected (3+ days without update)`);

        for (const pr of stalePRs) {
          // Add label
          try {
            await github.addLabels(
              config.github.defaultOwner,
              config.github.defaultRepo,
              pr.number,
              ["needs-attention"]
            );
            actionsCount++;
          } catch {
            // Label may already exist
          }
        }

        if (slack && slackChannel) {
          const prList = stalePRs
            .slice(0, 5)
            .map((pr) => {
              const age = Math.floor(
                (now - new Date(pr.updated_at).getTime()) / (1000 * 60 * 60 * 24)
              );
              return `  - <${pr.html_url}|#${pr.number}>: ${pr.title} (${age}d stale, by ${pr.user.login})`;
            })
            .join("\n");

          await slack.postSprintAlert(
            slackChannel,
            "warning",
            "Stale PRs Detected",
            `${stalePRs.length} PR(s) haven't been updated in 3+ days:\n${prList}${stalePRs.length > 5 ? `\n  ... and ${stalePRs.length - 5} more` : ""}`,
            [
              { label: "Repository", value: `${config.github.defaultOwner}/${config.github.defaultRepo}` },
              { label: "Threshold", value: "3 days" },
            ]
          );
          actionsCount++;
        }
      }

      // Check for failing CI
      const failingPRs: Array<{ pr: typeof prs[0]; checks: string[] }> = [];
      for (const pr of prs.slice(0, 10)) {
        try {
          const checkRuns = await github.getCheckRuns(
            config.github.defaultOwner,
            config.github.defaultRepo,
            pr.head.sha
          );
          const failures = checkRuns.filter((c) => c.conclusion === "failure");
          if (failures.length > 0) {
            failingPRs.push({
              pr,
              checks: failures.map((f) => f.name),
            });
          }
        } catch {
          // Skip
        }
      }

      if (failingPRs.length > 0) {
        findings.push(`${failingPRs.length} PR(s) with failing CI`);
      }
    } catch (err) {
      findings.push(`GitHub check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Check Jira for blockers and stale tickets
  if (jira && config.jira.defaultProject) {
    try {
      const staleIssues = await jira.getStaleIssues(config.jira.defaultProject, 3);
      if (staleIssues.length > 0) {
        findings.push(`${staleIssues.length} stale Jira ticket(s) (3+ days without update)`);
      }

      const blockers = await jira.getBlockedIssues(config.jira.defaultProject);
      if (blockers.length > 0) {
        findings.push(`${blockers.length} blocked/impediment Jira ticket(s)`);

        if (slack && slackChannel) {
          const blockerList = blockers
            .slice(0, 5)
            .map((b) => `  - <https://${config.jira.host}/browse/${b.key}|${b.key}>: ${b.fields.summary} (${b.fields.assignee?.displayName ?? "Unassigned"})`)
            .join("\n");

          await slack.postSprintAlert(
            slackChannel,
            "critical",
            "Sprint Blockers",
            `${blockers.length} blocker(s) in project ${config.jira.defaultProject}:\n${blockerList}`,
            [
              { label: "Project", value: config.jira.defaultProject },
              { label: "Total Blockers", value: String(blockers.length) },
            ]
          );
          actionsCount++;
        }
      }

      const deadlines = await jira.getApproachingDeadlines(config.jira.defaultProject, 3);
      if (deadlines.length > 0) {
        findings.push(`${deadlines.length} issue(s) approaching deadline within 3 days`);
      }
    } catch (err) {
      findings.push(`Jira check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Emit overall health event
  if (findings.length > 0) {
    emitNotification("audit_finding", {
      source: "reactive_agent",
      type: "proactive_health_check",
      findings,
      actionsCount,
      timestamp: new Date().toISOString(),
    });
  }

  return { findings, actionsCount };
}
