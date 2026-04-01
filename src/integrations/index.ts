/**
 * Sprint Guardian — Integrations Module
 *
 * Barrel export for all integration clients and the connection manager.
 */

export {
  getGitHubClient,
  createGitHubClientWithToken,
  verifyGitHubWebhookSignature,
  GitHubClient,
  type GitHubUser,
  type GitHubRepo,
  type GitHubPR,
  type GitHubCheckRun,
  type GitHubCommit,
  type GitHubIssue,
} from "./github-client.js";

export {
  getSlackClient,
  createSlackClientWithToken,
  verifySlackSignature,
  SlackClient,
  type SlackChannel,
  type SlackUser,
  type SlackMessage,
} from "./slack-client.js";

export {
  getJiraClient,
  createJiraClientWithCredentials,
  JiraClient,
  type JiraUser,
  type JiraProject,
  type JiraIssue,
  type JiraSprint,
  type JiraBoard,
} from "./jira-client.js";

export {
  getConnectionManager,
  ConnectionManager,
  type IntegrationProvider,
  type IntegrationConnectionStatus,
} from "./connection-manager.js";
