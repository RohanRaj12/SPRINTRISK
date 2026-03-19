import { fetchWithDelegatedToken } from "../services/index.js";
import type { ToolDefinition } from "./types.js";

/**
 * github_investigator
 *
 * Investigates GitHub repository health: open PRs, CI status,
 * and review bottlenecks.
 *
 * All API calls use delegated tokens from Auth0 Token Vault.
 */

interface GitHubPR {
  number: number;
  title: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
  draft: boolean;
  html_url: string;
  head: { sha: string };
  requested_reviewers: Array<{ login: string }>;
  labels: Array<{ name: string }>;
}

interface GitHubCheckSuite {
  conclusion: string | null;
  status: string;
  app: { name: string };
}

interface PRReport {
  number: number;
  title: string;
  author: string;
  ageInDays: number;
  draft: boolean;
  url: string;
  ciStatus: string;
  pendingReviewers: string[];
  labels: string[];
}

async function getPRCIStatus(
  userId: string,
  owner: string,
  repo: string,
  sha: string
): Promise<string> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-suites`;
    const response = await fetchWithDelegatedToken(userId, "github", url);

    if (!response.ok) return "unknown";

    const data = (await response.json()) as {
      check_suites: GitHubCheckSuite[];
    };

    if (data.check_suites.length === 0) return "no_checks";

    const hasFailure = data.check_suites.some(
      (s) => s.conclusion === "failure"
    );
    const allSuccess = data.check_suites.every(
      (s) => s.conclusion === "success"
    );
    const hasPending = data.check_suites.some(
      (s) => s.status === "in_progress" || s.status === "queued"
    );

    if (hasFailure) return "❌ failing";
    if (allSuccess) return "✅ passing";
    if (hasPending) return "⏳ pending";
    return "⚠️ mixed";
  } catch {
    return "unknown";
  }
}

export const githubInvestigator: ToolDefinition = {
  name: "github_investigator",
  description:
    "Investigate a GitHub repository's open pull requests — their CI/CD status, " +
    "review bottlenecks, and age. Helps identify slow PRs blocking the sprint.",
  parameters: {
    owner: {
      type: "string",
      description: 'GitHub repository owner / org (e.g. "acme-corp")',
    },
    repo: {
      type: "string",
      description: 'GitHub repository name (e.g. "backend-api")',
    },
    stale_pr_days: {
      type: "number",
      description:
        "Number of days a PR is considered stale if not merged (default: 2)",
    },
  },
  required: ["owner", "repo"],

  async execute(args, userId) {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const stalePRDays = (args.stale_pr_days as number) ?? 2;

    // Fetch open pull requests
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&sort=created&direction=asc&per_page=30`;
    const response = await fetchWithDelegatedToken(userId, "github", url, {
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${body}`);
    }

    const prs = (await response.json()) as GitHubPR[];
    const now = Date.now();

    // Analyze each PR
    const reports: PRReport[] = await Promise.all(
      prs.map(async (pr) => {
        const ageInDays = Math.floor(
          (now - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        const ciStatus = await getPRCIStatus(
          userId,
          owner,
          repo,
          pr.head.sha
        );

        return {
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          ageInDays,
          draft: pr.draft,
          url: pr.html_url,
          ciStatus,
          pendingReviewers: pr.requested_reviewers.map((r) => r.login),
          labels: pr.labels.map((l) => l.name),
        };
      })
    );

    // Identify problems
    const stalePRs = reports.filter((r) => r.ageInDays >= stalePRDays);
    const failingCI = reports.filter((r) => r.ciStatus.includes("failing"));
    const awaitingReview = reports.filter(
      (r) => r.pendingReviewers.length > 0 && !r.draft
    );

    const summary = [
      `📊 ${repo}: ${prs.length} open PR(s)`,
      stalePRs.length > 0
        ? `⚠️ ${stalePRs.length} stale PR(s) (open ${stalePRDays}+ days)`
        : `✅ No stale PRs`,
      failingCI.length > 0
        ? `❌ ${failingCI.length} PR(s) with failing CI`
        : `✅ All CI checks passing`,
      awaitingReview.length > 0
        ? `👀 ${awaitingReview.length} PR(s) awaiting review`
        : `✅ No PRs blocked on reviews`,
    ].join("\n");

    return {
      repository: `${owner}/${repo}`,
      totalOpenPRs: prs.length,
      stalePRDaysThreshold: stalePRDays,
      summary,
      stalePRs,
      failingCI,
      awaitingReview,
      allPRs: reports,
    };
  },
};
