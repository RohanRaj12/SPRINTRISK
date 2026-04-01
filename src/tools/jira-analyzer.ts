import { fetchWithDelegatedToken } from "../services/index.js";
import type { ToolDefinition } from "./types.js";

/**
 * jira_analyzer
 *
 * Queries Jira Cloud for issues in a given sprint / project
 * and identifies stale tickets (not updated within a threshold).
 *
 * All API calls use delegated tokens from Auth0 Token Vault.
 */

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
}

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    assignee: { displayName: string; emailAddress?: string } | null;
    updated: string;
    priority: { name: string };
    issuetype: { name: string };
    created: string;
  };
}

interface StaleTicket {
  key: string;
  summary: string;
  status: string;
  assignee: string;
  daysSinceUpdate: number;
  priority: string;
  type: string;
}

function analyzeStaleTickets(
  issues: JiraIssue[],
  staleDaysThreshold: number
): { staleTickets: StaleTicket[]; summary: string } {
  const now = Date.now();
  const staleTickets: StaleTicket[] = [];

  for (const issue of issues) {
    const updatedAt = new Date(issue.fields.updated).getTime();
    const daysSinceUpdate = Math.floor(
      (now - updatedAt) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceUpdate >= staleDaysThreshold) {
      staleTickets.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName ?? "Unassigned",
        daysSinceUpdate,
        priority: issue.fields.priority.name,
        type: issue.fields.issuetype.name,
      });
    }
  }

  // Sort by staleness (most stale first)
  staleTickets.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  const summary =
    staleTickets.length === 0
      ? `✅ No stale tickets found (threshold: ${staleDaysThreshold} days). Sprint looks healthy!`
      : `⚠️ Found ${staleTickets.length} stale ticket(s) (not updated in ${staleDaysThreshold}+ days).`;

  return { staleTickets, summary };
}

export const jiraAnalyzer: ToolDefinition = {
  name: "jira_analyzer",
  description:
    "Analyze Jira tickets for a given project to find stale issues that haven't been updated recently. " +
    "Helps identify sprint health problems like blocked or abandoned work.",
  parameters: {
    jira_site: {
      type: "string",
      description:
        'The Jira Cloud site domain (e.g. "mycompany.atlassian.net")',
    },
    project_key: {
      type: "string",
      description: 'The Jira project key (e.g. "SPRINT", "ENG")',
    },
    stale_days: {
      type: "number",
      description:
        "Number of days without an update before a ticket is considered stale (default: 3)",
    },
    sprint_name: {
      type: "string",
      description:
        'Optional sprint name to filter by (e.g. "Sprint 42"). If omitted, checks all open issues.',
    },
  },
  required: ["jira_site", "project_key"],

  async execute(args, userId) {
    const site = args.jira_site as string;
    const projectKey = args.project_key as string;
    const staleDays = (args.stale_days as number) ?? 3;
    const sprintName = args.sprint_name as string | undefined;

    // Validate inputs to prevent JQL injection
    if (!/^[A-Z0-9_-]{1,20}$/i.test(projectKey)) {
      throw new Error(`Invalid project key: "${projectKey}". Must be alphanumeric.`);
    }

    const escapeJql = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    // Build JQL query
    let jql = `project = "${escapeJql(projectKey)}" AND statusCategory != Done`;
    if (sprintName) {
      jql += ` AND sprint = "${escapeJql(sprintName)}"`;
    }
    jql += ` ORDER BY updated ASC`;

    const url = `https://${site}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee,updated,priority,issuetype,created&maxResults=50`;

    const response = await fetchWithDelegatedToken(userId, "jira", url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira API error: ${response.status} ${body}`);
    }

    const data = (await response.json()) as JiraSearchResponse;
    const analysis = analyzeStaleTickets(data.issues, staleDays);

    return {
      project: projectKey,
      totalOpenIssues: data.total,
      staleDaysThreshold: staleDays,
      ...analysis,
    };
  },
};
