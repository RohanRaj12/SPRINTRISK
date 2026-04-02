import { fetchWithDelegatedToken } from "../services/index.js";
import { storeMemory, retrieveRelevantMemories } from "../services/memory-service.js";
import type { ToolDefinition } from "./types.js";

/**
 * github_commenter
 *
 * Posts comments on GitHub pull requests for:
 * - Health-check summaries on stale PRs
 * - Reviewer nudges (mentions reviewers who haven't responded)
 *
 * Uses either direct GitHub token or Auth0 Token Vault delegation.
 * Includes a cooldown mechanism via the Memory Service to prevent spam.
 */

const COOLDOWN_HOURS = 48;

/**
 * All GitHub API calls go through Auth0 Token Vault.
 * The Token Vault service handles fallback to direct env tokens automatically.
 */
async function ghFetch(
  userId: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetchWithDelegatedToken(userId, "github", url, {
    ...options,
    headers: {
      ...Object.fromEntries(new Headers(options.headers).entries()),
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

export const githubCommenter: ToolDefinition = {
  name: "github_commenter",
  description:
    "Post a comment on a GitHub pull request. Use for health-check summaries, " +
    "reviewer nudges, or CI failure notifications. Has a built-in 48-hour " +
    "cooldown per PR to prevent duplicate comments.",
  parameters: {
    owner: {
      type: "string",
      description: 'GitHub repository owner (e.g. "acme-corp")',
    },
    repo: {
      type: "string",
      description: 'GitHub repository name (e.g. "backend-api")',
    },
    pr_number: {
      type: "number",
      description: "Pull request number to comment on",
    },
    comment_type: {
      type: "string",
      description: "Type of comment for cooldown tracking",
      enum: ["health_check", "reviewer_nudge", "ci_failure", "general"],
    },
    message: {
      type: "string",
      description:
        "The comment body. Supports GitHub-flavored Markdown.",
    },
    mention_reviewers: {
      type: "boolean",
      description: "If true, prepend @mentions for pending reviewers.",
    },
  },
  required: ["owner", "repo", "pr_number", "message"],

  async execute(args, userId) {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const prNumber = args.pr_number as number;
    const commentType = (args.comment_type as string) ?? "general";
    let message = args.message as string;
    const mentionReviewers = (args.mention_reviewers as boolean) ?? false;
    const orgId = "default";

    // ── Cooldown check via Memory Service ──
    const cooldownKey = `github_comment_cooldown:${owner}/${repo}#${prNumber}:${commentType}`;
    const existing = retrieveRelevantMemories(orgId, {
      keywords: [cooldownKey],
      types: ["context"],
    });

    const recentComment = existing.find((m) => {
      if (!m.key.includes(cooldownKey)) return false;
      const hoursAgo =
        (Date.now() - m.createdAt.getTime()) / (1000 * 60 * 60);
      return hoursAgo < COOLDOWN_HOURS;
    });

    if (recentComment) {
      return {
        success: false,
        skipped: true,
        reason: `Cooldown active — a "${commentType}" comment was posted on PR #${prNumber} within the last ${COOLDOWN_HOURS} hours.`,
      };
    }

    // ── Fetch pending reviewers if mentioning ──
    if (mentionReviewers) {
      try {
        const prUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
        const prRes = await ghFetch(userId, prUrl);
        if (prRes.ok) {
          const prData = (await prRes.json()) as {
            requested_reviewers: Array<{ login: string }>;
          };
          const reviewers = prData.requested_reviewers.map(
            (r) => `@${r.login}`
          );
          if (reviewers.length > 0) {
            message = `👋 ${reviewers.join(", ")} — ${message}`;
          }
        }
      } catch {
        // Non-fatal: proceed without mentions
      }
    }

    // ── Post the comment ──
    const commentUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
    const response = await ghFetch(userId, commentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: `🤖 **SPRINTRISK** | _${commentType}_\n\n${message}`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `GitHub API error ${response.status}: ${body}`,
      };
    }

    const result = (await response.json()) as {
      id: number;
      html_url: string;
    };

    // ── Store cooldown in Memory Service ──
    storeMemory({
      orgId,
      type: "context",
      key: cooldownKey,
      content: `Comment posted on PR #${prNumber} (${commentType}) at ${new Date().toISOString()}`,
      confidence: 1.0,
    });

    return {
      success: true,
      commentId: result.id,
      url: result.html_url,
      message: `Posted ${commentType} comment on ${owner}/${repo}#${prNumber}`,
    };
  },
};
