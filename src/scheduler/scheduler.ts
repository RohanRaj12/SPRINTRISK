import cron from "node-cron";
import { config } from "../config.js";
import { runAgent } from "../agent/index.js";
import { createToolRegistry } from "../tools/index.js";

const registry = createToolRegistry();

/**
 * The prompt that drives the automatic sprint audit.
 * This is what gets sent to Gemini on every scheduled run.
 */
function buildAuditPrompt(): string {
  const { jiraSite, jiraProjectKey, githubOwner, githubRepo, slackChannel } =
    config.scheduler;

  return `
Run a full sprint health audit with the following parameters:

1. **Jira Analysis**
   - Site: ${jiraSite}
   - Project: ${jiraProjectKey}
   - Flag any tickets not updated in 3+ days

2. **GitHub Investigation**
   - Repository: ${githubOwner}/${githubRepo}
   - Flag PRs open for 2+ days, failing CI, and pending reviews

3. **Slack Notification**
   - Post a summary of findings to ${slackChannel}
   - Use severity "warning" if there are issues, "info" if sprint is healthy
   - Include specific ticket/PR numbers and assignees in the notification

Provide a comprehensive sprint health report at the end.
`.trim();
}

/**
 * Execute a single scheduled audit run.
 */
async function executeAudit(): Promise<void> {
  const userId = config.scheduler.auditUserId;

  if (!userId) {
    console.error(
      "[Scheduler] SCHEDULER_AUDIT_USER_ID is not set. Skipping audit."
    );
    return;
  }

  console.log(`[Scheduler] Starting automatic sprint audit at ${new Date().toISOString()}`);

  try {
    const result = await runAgent(buildAuditPrompt(), userId, registry);

    console.log("[Scheduler] Audit complete:", {
      rounds: result.rounds,
      toolCalls: result.toolCalls.length,
      responseSummary: result.response.substring(0, 200) + "...",
    });
  } catch (err) {
    console.error("[Scheduler] Audit failed:", err);
  }
}

/**
 * Start the cron-based scheduler.
 *
 * Call this from the server entry point after startup.
 * The scheduler will only run if SCHEDULER_ENABLED=true.
 */
export function startScheduler(): void {
  if (!config.scheduler.enabled) {
    console.log("[Scheduler] Disabled (set SCHEDULER_ENABLED=true to enable)");
    return;
  }

  const cronExpression = config.scheduler.cron;

  if (!cron.validate(cronExpression)) {
    console.error(
      `[Scheduler] Invalid cron expression: "${cronExpression}". Scheduler not started.`
    );
    return;
  }

  console.log(
    `[Scheduler] Scheduling sprint audits with cron: "${cronExpression}"`
  );

  cron.schedule(cronExpression, () => {
    executeAudit().catch((err) =>
      console.error("[Scheduler] Unhandled error in audit:", err)
    );
  });

  console.log("[Scheduler] ✅ Scheduler started successfully");
}

/**
 * Manually trigger an audit (useful for testing or on-demand runs).
 */
export { executeAudit };
