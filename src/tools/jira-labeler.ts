import { fetchWithDelegatedToken } from "../services/index.js";
import { config } from "../config.js";
import type { ToolDefinition } from "./types.js";

/**
 * jira_labeler
 *
 * Automatically applies labels to Jira tickets.
 * Primary use case: tag stale tickets with "stale" or "needs-attention"
 * labels after the jira_analyzer detects them.
 *
 * This is a LOW RISK, reversible metadata operation — the agent can
 * remove labels on the next run if the ticket has been updated.
 */

/**
 * All Jira API calls go through Auth0 Token Vault.
 * The Token Vault handles fallback to direct env tokens automatically.
 */
async function jiraFetch(
  userId: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetchWithDelegatedToken(userId, "jira", url, {
    ...options,
    headers: {
      ...Object.fromEntries(new Headers(options.headers).entries()),
      "Content-Type": "application/json",
    },
  });
}

export const jiraLabeler: ToolDefinition = {
  name: "jira_labeler",
  description:
    "Apply or remove labels on Jira tickets. Commonly used to tag stale " +
    "tickets with 'stale' or 'agent-flagged' labels after analysis. " +
    "This is a reversible metadata operation with no user-facing impact.",
  parameters: {
    jira_site: {
      type: "string",
      description:
        'The Jira Cloud site domain (e.g. "mycompany.atlassian.net")',
    },
    issue_key: {
      type: "string",
      description: 'The Jira issue key (e.g. "ENG-402")',
    },
    add_labels: {
      type: "array",
      description:
        'Labels to add (e.g. ["stale", "agent-flagged"]). Created automatically if they don\'t exist.',
      items: { type: "string" },
    },
    remove_labels: {
      type: "array",
      description:
        "Labels to remove from the ticket.",
      items: { type: "string" },
    },
  },
  required: ["jira_site", "issue_key"],

  async execute(args, userId) {
    const site = (args.jira_site as string) || config.jira.host;
    const issueKey = args.issue_key as string;
    const addLabels = (args.add_labels as string[]) ?? [];
    const removeLabels = (args.remove_labels as string[]) ?? [];

    if (addLabels.length === 0 && removeLabels.length === 0) {
      return {
        success: false,
        error: "At least one of add_labels or remove_labels must be provided.",
      };
    }

    // Validate issue key
    if (!/^[A-Z][A-Z0-9_]+-\d+$/i.test(issueKey)) {
      throw new Error(
        `Invalid issue key: "${issueKey}". Expected format like "ENG-402".`
      );
    }

    // Jira REST API v3: update labels via PUT /rest/api/3/issue/{key}
    const url = `https://${site}/rest/api/3/issue/${issueKey}`;

    const updatePayload: Record<string, unknown> = {
      update: {
        labels: [
          ...addLabels.map((l) => ({ add: l })),
          ...removeLabels.map((l) => ({ remove: l })),
        ],
      },
    };

    const response = await jiraFetch(userId, url, {
      method: "PUT",
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Jira API error ${response.status}: ${body}`,
      };
    }

    // Jira returns 204 No Content on successful update
    return {
      success: true,
      issueKey,
      labelsAdded: addLabels,
      labelsRemoved: removeLabels,
      message: `Updated labels on ${issueKey}: +[${addLabels.join(", ")}] -[${removeLabels.join(", ")}]`,
    };
  },
};
