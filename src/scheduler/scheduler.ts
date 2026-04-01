/**
 * Sprint Guardian — Scheduler (deprecated)
 *
 * The cron-based scheduler has been replaced by event-driven triggers.
 * Audits are now triggered via:
 *   1. POST /api/audit/trigger (on-demand)
 *   2. Webhook endpoints (Jira/GitHub)
 *   3. Polling interval (future)
 *
 * These stubs exist for backward compatibility.
 */

export function startScheduler(): void {
  console.log("[Scheduler] Event-driven mode — cron scheduler disabled. Use POST /api/audit/trigger.");
}

export async function executeAudit(): Promise<void> {
  console.log("[Scheduler] Use POST /api/audit/trigger instead.");
}
