import { ToolRegistry } from "./types.js";
import { jiraAnalyzer } from "./jira-analyzer.js";
import { githubInvestigator } from "./github-investigator.js";
import { slackNotifier } from "./slack-notifier.js";
import { githubCommenter } from "./github-commenter.js";
import { jiraLabeler } from "./jira-labeler.js";
import { jiraCommenter } from "./jira-commenter.js";
import { dependencyMapper } from "./dependency-mapper.js";

export { ToolRegistry, type ToolDefinition } from "./types.js";

/**
 * Create and return a ToolRegistry pre-loaded with
 * all SPRINTRISK tools.
 *
 * Tools marked [AUTO] run without human approval.
 * Tools marked [GATED] require approval for certain risk levels.
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // ── Read-only analyzers [AUTO] ──
  registry.register(jiraAnalyzer);
  registry.register(githubInvestigator);
  registry.register(dependencyMapper);

  // ── Write: low-risk metadata [AUTO] ──
  registry.register(jiraLabeler);
  registry.register(jiraCommenter);
  registry.register(githubCommenter);

  // ── Notifications [GATED for DMs, AUTO for channels] ──
  registry.register(slackNotifier);

  return registry;
}
