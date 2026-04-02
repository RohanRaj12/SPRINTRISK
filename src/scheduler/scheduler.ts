/**
 * SPRINTRISK — Scheduler
 *
 * Cron-based automation for autonomous agent tasks:
 *
 * 1. Daily Sprint Digest (Mon–Fri 9:00 AM)
 *    - Runs OBSERVE phase (jira_analyzer + github_investigator)
 *    - Posts a formatted summary to the configured Slack channel
 *    - Applies "stale" labels to flagged Jira tickets
 *    - Posts health-check comments on stale PRs
 *    - ALL steps run AUTO — zero human approval needed
 *
 * 2. Weekly Dependency Graph (Monday 8:00 AM)
 *    - Runs the dependency_mapper tool
 *    - Maps Jira tickets ↔ GitHub PRs
 *    - Stores relationships as high-confidence context memories
 *    - 100% read-only — no side effects
 */

import cron from "node-cron";
import { config } from "../config.js";
import { createToolRegistry } from "../tools/index.js";
import { logAuditEvent } from "../services/audit-logger.js";
import { getUserLinkedServices } from "../services/token-vault.js";

const registry = createToolRegistry();

// ── Configuration ──

interface SchedulerConfig {
  enabled: boolean;
  dailyCron: string;       // Default: "0 9 * * 1-5" (Mon–Fri 9 AM)
  weeklyCron: string;      // Default: "0 8 * * 1" (Monday 8 AM)
  userId: string;          // Auth0 user ID for delegation
  orgId: string;
  jiraSite: string;
  jiraProject: string;
  githubOwner: string;
  githubRepo: string;
  slackChannel: string;
}

function getSchedulerConfig(): SchedulerConfig {
  return {
    enabled: process.env.SCHEDULER_ENABLED === "true",
    dailyCron: process.env.SCHEDULER_CRON ?? "0 9 * * 1-5",
    weeklyCron: process.env.SCHEDULER_WEEKLY_CRON ?? "0 8 * * 1",
    userId: process.env.SCHEDULER_AUDIT_USER_ID ?? "auth0|scheduler",
    orgId: process.env.SCHEDULER_ORG_ID ?? "default",
    jiraSite: process.env.SCHEDULER_JIRA_SITE ?? config.jira.host,
    jiraProject: process.env.SCHEDULER_JIRA_PROJECT ?? config.jira.defaultProject,
    githubOwner: process.env.SCHEDULER_GITHUB_OWNER ?? config.github.defaultOwner,
    githubRepo: process.env.SCHEDULER_GITHUB_REPO ?? config.github.defaultRepo,
    slackChannel: process.env.SCHEDULER_SLACK_CHANNEL ?? config.slack.defaultChannel ?? "#engineering",
  };
}

// ── Daily Sprint Digest ──

async function runDailyDigest(cfg: SchedulerConfig): Promise<void> {
  const runId = `scheduled_digest_${Date.now()}`;

  logAuditEvent({
    orgId: cfg.orgId,
    userId: cfg.userId,
    runId,
    action: "scheduler.daily_digest.started",
    category: "agent",
    severity: "info",
    description: "Daily sprint digest started",
  });

  console.log("[Scheduler] 📊 Running daily sprint digest...");

  const results: string[] = [];
  let staleTickets: Array<{ key: string; summary: string; daysSinceUpdate: number; assignee: string }> = [];
  let stalePRs: Array<{ number: number; title: string; author: string; ageInDays: number; pendingReviewers: string[] }> = [];

  // ── Step 1: Observe Jira ──
  if (cfg.jiraSite && cfg.jiraProject) {
    try {
      const jiraTool = registry.get("jira_analyzer");
      if (jiraTool) {
        const jiraResult = await jiraTool.execute(
          { jira_site: cfg.jiraSite, project_key: cfg.jiraProject, stale_days: 3 },
          cfg.userId
        ) as { totalOpenIssues: number; staleTickets: typeof staleTickets; summary: string };

        results.push(`*Jira (${cfg.jiraProject})*: ${jiraResult.totalOpenIssues} open issues`);
        staleTickets = jiraResult.staleTickets ?? [];
        if (staleTickets.length > 0) {
          results.push(`  ⚠️ ${staleTickets.length} stale tickets:`);
          for (const t of staleTickets.slice(0, 5)) {
            results.push(`  • \`${t.key}\` — ${t.summary} (${t.daysSinceUpdate}d, ${t.assignee})`);
          }
        } else {
          results.push("  ✅ No stale tickets");
        }
      }
    } catch (err) {
      console.warn("[Scheduler] Jira observation failed:", (err as Error).message);
      results.push("*Jira*: ⚠️ Failed to connect");
    }
  }

  // ── Step 2: Observe GitHub ──
  if (cfg.githubOwner && cfg.githubRepo) {
    try {
      const ghTool = registry.get("github_investigator");
      if (ghTool) {
        const ghResult = await ghTool.execute(
          { owner: cfg.githubOwner, repo: cfg.githubRepo, stale_pr_days: 2 },
          cfg.userId
        ) as { totalOpenPRs: number; stalePRs: typeof stalePRs; failingCI: Array<{ number: number }> };

        results.push(`*GitHub (${cfg.githubOwner}/${cfg.githubRepo})*: ${ghResult.totalOpenPRs} open PRs`);
        stalePRs = ghResult.stalePRs ?? [];
        const failingCI = ghResult.failingCI ?? [];
        if (stalePRs.length > 0) results.push(`  ⚠️ ${stalePRs.length} stale PRs`);
        if (failingCI.length > 0) results.push(`  ❌ ${failingCI.length} PRs with failing CI`);
        if (stalePRs.length === 0 && failingCI.length === 0) results.push("  ✅ All PRs healthy");
      }
    } catch (err) {
      console.warn("[Scheduler] GitHub observation failed:", (err as Error).message);
      results.push("*GitHub*: ⚠️ Failed to connect");
    }
  }

  // ── Step 3: Auto-label stale Jira tickets ──
  if (staleTickets.length > 0 && cfg.jiraSite) {
    const labeler = registry.get("jira_labeler");
    if (labeler) {
      for (const ticket of staleTickets.slice(0, 10)) {
        try {
          await labeler.execute(
            { jira_site: cfg.jiraSite, issue_key: ticket.key, add_labels: ["stale", "agent-flagged"] },
            cfg.userId
          );
          console.log(`[Scheduler] 🏷️ Labeled ${ticket.key} as stale`);
        } catch (err) {
          console.warn(`[Scheduler] Failed to label ${ticket.key}:`, (err as Error).message);
        }
      }
    }
  }

  // ── Step 4: Post health-check comments on stale PRs ──
  if (stalePRs.length > 0 && cfg.githubOwner && cfg.githubRepo) {
    const commenter = registry.get("github_commenter");
    if (commenter) {
      for (const pr of stalePRs.slice(0, 5)) {
        try {
          const reviewersList = pr.pendingReviewers.length > 0
            ? `Pending reviewers: ${pr.pendingReviewers.join(", ")}`
            : "No pending reviewers";
          await commenter.execute(
            {
              owner: cfg.githubOwner,
              repo: cfg.githubRepo,
              pr_number: pr.number,
              comment_type: "health_check",
              message: `This PR has been open for **${pr.ageInDays} days**. ${reviewersList}. Please review or close if no longer needed.`,
              mention_reviewers: pr.ageInDays >= 3,
            },
            cfg.userId
          );
          console.log(`[Scheduler] 💬 Commented on PR #${pr.number}`);
        } catch (err) {
          console.warn(`[Scheduler] Failed to comment on PR #${pr.number}:`, (err as Error).message);
        }
      }
    }
  }

  // ── Step 5: Post digest to Slack ──
  if (cfg.slackChannel) {
    const slackTool = registry.get("slack_notifier");
    if (slackTool) {
      const riskLevel = staleTickets.length > 3 || stalePRs.length > 3 ? "🔴 High" : staleTickets.length > 0 || stalePRs.length > 0 ? "🟡 Medium" : "🟢 Healthy";

      const digestMessage = [
        `📊 *Daily Sprint Digest* — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
        `Sprint Risk: *${riskLevel}*`,
        "",
        ...results,
        "",
        `_Autonomous actions taken: ${staleTickets.length > 0 ? `labeled ${Math.min(staleTickets.length, 10)} stale tickets` : "none"}, ${stalePRs.length > 0 ? `commented on ${Math.min(stalePRs.length, 5)} stale PRs` : "none"}_`,
      ].join("\n");

      try {
        await slackTool.execute(
          { channel: cfg.slackChannel, message: digestMessage, severity: "info" },
          cfg.userId
        );
        console.log(`[Scheduler] 📬 Digest posted to ${cfg.slackChannel}`);
      } catch (err) {
        console.warn("[Scheduler] Slack notification failed:", (err as Error).message);
      }
    }
  }

  logAuditEvent({
    orgId: cfg.orgId,
    userId: cfg.userId,
    runId,
    action: "scheduler.daily_digest.completed",
    category: "agent",
    severity: "info",
    description: `Daily digest completed. Stale tickets: ${staleTickets.length}, Stale PRs: ${stalePRs.length}`,
    metadata: { staleTickets: staleTickets.length, stalePRs: stalePRs.length },
  });

  console.log("[Scheduler] ✅ Daily digest completed");
}

// ── Weekly Dependency Graph ──

async function runWeeklyDependencyGraph(cfg: SchedulerConfig): Promise<void> {
  const runId = `scheduled_depgraph_${Date.now()}`;

  logAuditEvent({
    orgId: cfg.orgId,
    userId: cfg.userId,
    runId,
    action: "scheduler.dependency_graph.started",
    category: "agent",
    severity: "info",
    description: "Weekly dependency graph mapping started",
  });

  console.log("[Scheduler] 🗺️ Running weekly dependency graph...");

  if (!cfg.githubOwner || !cfg.githubRepo) {
    console.warn("[Scheduler] Skipping dependency graph — GitHub not configured");
    return;
  }

  const mapper = registry.get("dependency_mapper");
  if (!mapper) {
    console.warn("[Scheduler] dependency_mapper tool not found in registry");
    return;
  }

  try {
    const result = await mapper.execute(
      {
        owner: cfg.githubOwner,
        repo: cfg.githubRepo,
        jira_site: cfg.jiraSite,
        project_key: cfg.jiraProject,
      },
      cfg.userId
    ) as { totalLinks: number; summary: string };

    logAuditEvent({
      orgId: cfg.orgId,
      userId: cfg.userId,
      runId,
      action: "scheduler.dependency_graph.completed",
      category: "agent",
      severity: "info",
      description: result.summary,
      metadata: { totalLinks: result.totalLinks },
    });

    console.log(`[Scheduler] ✅ ${result.summary}`);
  } catch (err) {
    console.error("[Scheduler] Dependency graph failed:", (err as Error).message);

    logAuditEvent({
      orgId: cfg.orgId,
      userId: cfg.userId,
      runId,
      action: "scheduler.dependency_graph.failed",
      category: "agent",
      severity: "error",
      description: `Dependency graph failed: ${(err as Error).message}`,
    });
  }
}

// ── Scheduler Entry Points ──

export function startScheduler(): void {
  const cfg = getSchedulerConfig();

  if (!cfg.enabled) {
    console.log("[Scheduler] Disabled (set SCHEDULER_ENABLED=true to enable)");
    return;
  }

  console.log("[Scheduler] 🚀 Starting autonomous agent scheduler");
  console.log(`[Scheduler]   Daily digest:       ${cfg.dailyCron}`);
  console.log(`[Scheduler]   Weekly dep graph:   ${cfg.weeklyCron}`);
  console.log(`[Scheduler]   Jira:               ${cfg.jiraSite}/${cfg.jiraProject}`);
  console.log(`[Scheduler]   GitHub:             ${cfg.githubOwner}/${cfg.githubRepo}`);
  console.log(`[Scheduler]   Slack:              ${cfg.slackChannel}`);
  console.log(`[Scheduler]   Delegation User:    ${cfg.userId}`);

  // Validate Token Vault access for the scheduler user
  validateSchedulerUser(cfg.userId).then((valid) => {
    if (!valid) {
      console.warn(
        "[Scheduler] ⚠️ Scheduler user missing linked services. " +
        "The scheduler will attempt to run but may fail on API calls. " +
        "Ensure the user has linked GitHub, Jira, and Slack via Auth0, " +
        "or set direct env tokens as fallback."
      );
    } else {
      console.log("[Scheduler] ✅ Token Vault access validated for all services");
    }
  });

  // Daily Sprint Digest
  cron.schedule(cfg.dailyCron, () => {
    runDailyDigest(cfg).catch((err) =>
      console.error("[Scheduler] Daily digest error:", err)
    );
  });

  // Weekly Dependency Graph
  cron.schedule(cfg.weeklyCron, () => {
    runWeeklyDependencyGraph(cfg).catch((err) =>
      console.error("[Scheduler] Dependency graph error:", err)
    );
  });

  console.log("[Scheduler] ✅ Cron jobs registered");
}

/**
 * Validate that the scheduler user has Token Vault access for all services.
 */
async function validateSchedulerUser(userId: string): Promise<boolean> {
  try {
    const linked = await getUserLinkedServices(userId);
    const services = ["github", "jira", "slack"] as const;
    let allLinked = true;

    for (const service of services) {
      if (linked[service].linked) {
        const method = linked[service].isFallback ? "env fallback" : "Token Vault";
        console.log(`[Scheduler]   ✅ ${service}: accessible via ${method}`);
      } else {
        console.warn(`[Scheduler]   ❌ ${service}: NOT accessible`);
        allLinked = false;
      }
    }

    return allLinked;
  } catch (err) {
    console.warn("[Scheduler] Token Vault validation failed:", (err as Error).message);
    return false;
  }
}

/**
 * Execute audit manually (for testing or on-demand triggers).
 */
export async function executeAudit(): Promise<void> {
  const cfg = getSchedulerConfig();
  await runDailyDigest(cfg);
}

/**
 * Execute dependency mapping manually.
 */
export async function executeDependencyGraph(): Promise<void> {
  const cfg = getSchedulerConfig();
  await runWeeklyDependencyGraph(cfg);
}
