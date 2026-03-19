import { ToolRegistry } from "./types.js";
import { jiraAnalyzer } from "./jira-analyzer.js";
import { githubInvestigator } from "./github-investigator.js";
import { slackNotifier } from "./slack-notifier.js";

export { ToolRegistry, type ToolDefinition } from "./types.js";

/**
 * Create and return a ToolRegistry pre-loaded with
 * all Sprint Guardian tools.
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(jiraAnalyzer);
  registry.register(githubInvestigator);
  registry.register(slackNotifier);
  return registry;
}
