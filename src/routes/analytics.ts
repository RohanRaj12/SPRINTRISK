/**
 * Sprint Guardian — Analytics API Routes
 *
 * Computes sprint risk scores, priority distributions, type breakdowns,
 * developer load analysis, and blocker chain insights.
 */

import type { FastifyInstance } from "fastify";
import { getDataSource } from "../data/index.js";

interface RiskBreakdown {
  score: number;
  label: "healthy" | "at_risk" | "warning" | "critical";
  factors: Array<{ name: string; impact: number; detail: string }>;
}

interface SprintAnalytics {
  risk: RiskBreakdown;
  counts: {
    total: number;
    stale: number;
    blocked: number;
    review: number;
    healthy: number;
    jira: number;
    github: number;
  };
  priorityDistribution: Record<string, number>;
  typeBreakdown: Record<string, number>;
  developerLoad: Array<{ assignee: string; count: number; staleCount: number }>;
  stalestTickets: Array<{ id: string; title: string; assignee: string; daysStale: number }>;
  velocityEstimate: { completed: number; remaining: number; pctDone: number };
}

function computeRisk(issues: any[]): RiskBreakdown {
  let score = 100;
  const factors: RiskBreakdown["factors"] = [];

  const stale = issues.filter((i) => i.status === "stale");
  const blocked = issues.filter((i) => i.status === "blocked");
  const review = issues.filter((i) => i.status === "review");

  if (blocked.length > 0) {
    const impact = Math.min(blocked.length * 15, 40);
    score -= impact;
    factors.push({ name: "Blocked tickets", impact, detail: `${blocked.length} ticket(s) are blocked` });
  }

  if (stale.length > 0) {
    const impact = Math.min(stale.length * 8, 30);
    score -= impact;
    factors.push({ name: "Stale tickets", impact, detail: `${stale.length} ticket(s) not updated in 3+ days` });
  }

  if (review.length > 0) {
    const impact = Math.min(review.length * 3, 15);
    score -= impact;
    factors.push({ name: "Pending reviews", impact, detail: `${review.length} PR(s) awaiting review` });
  }

  // Check for high-day-stale tickets (extra penalty)
  const veryStale = issues.filter((i) => (i.daysStale ?? 0) > 7);
  if (veryStale.length > 0) {
    const impact = Math.min(veryStale.length * 5, 15);
    score -= impact;
    factors.push({ name: "Very stale (7+ days)", impact, detail: `${veryStale.length} item(s) stale for over a week` });
  }

  // Developer overload: if any dev has 5+ items
  const devCounts: Record<string, number> = {};
  for (const i of issues) {
    devCounts[i.assignee] = (devCounts[i.assignee] || 0) + 1;
  }
  const overloaded = Object.entries(devCounts).filter(([, c]) => c >= 5);
  if (overloaded.length > 0) {
    score -= 5;
    factors.push({ name: "Developer overload", impact: 5, detail: `${overloaded.map(([a]) => a).join(", ")} have 5+ items` });
  }

  score = Math.max(0, Math.min(100, score));

  const label: RiskBreakdown["label"] =
    score >= 80 ? "healthy" : score >= 60 ? "at_risk" : score >= 40 ? "warning" : "critical";

  return { score, label, factors };
}

export async function analyticsRoutes(fastify: FastifyInstance) {
  // ── Sprint Risk Score + Full Analytics ──
  fastify.get("/api/analytics/sprint-risk", async (request) => {
    const user = request.user as Record<string, unknown>;
    const userId = user.sub as string;
    const ds = getDataSource();

    const [issues, prs] = await Promise.all([
      ds.getSprintIssues(userId),
      ds.getGithubPRs(userId),
    ]);

    // Merge issues + PRs into unified list
    const allItems = [
      ...issues.map((i) => ({ ...i, itemType: "issue" })),
      ...prs.map((p) => ({
        id: `PR-${p.number}`,
        title: p.title,
        assignee: p.author,
        status: p.ciStatus.includes("failing") ? "blocked" : (p.ageInDays > 3 ? "stale" : "healthy"),
        daysStale: p.ageInDays,
        provider: "github" as const,
        priority: "medium",
        type: "pr",
        itemType: "pr",
      })),
    ];

    const risk = computeRisk(allItems);

    const counts = {
      total: allItems.length,
      stale: allItems.filter((i) => i.status === "stale").length,
      blocked: allItems.filter((i) => i.status === "blocked").length,
      review: allItems.filter((i) => i.status === "review").length,
      healthy: allItems.filter((i) => i.status === "healthy").length,
      jira: allItems.filter((i) => i.provider === "jira").length,
      github: allItems.filter((i) => i.provider === "github").length,
    };

    // Priority distribution
    const priorityDistribution: Record<string, number> = {};
    for (const item of allItems) {
      const p = (item as any).priority ?? "medium";
      priorityDistribution[p] = (priorityDistribution[p] || 0) + 1;
    }

    // Type breakdown
    const typeBreakdown: Record<string, number> = {};
    for (const item of allItems) {
      const t = (item as any).type ?? (item as any).itemType ?? "unknown";
      typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
    }

    // Developer load
    const devMap: Record<string, { count: number; staleCount: number }> = {};
    for (const item of allItems) {
      const a = (item as any).assignee ?? "Unassigned";
      if (!devMap[a]) devMap[a] = { count: 0, staleCount: 0 };
      devMap[a].count++;
      if (item.status === "stale" || item.status === "blocked") devMap[a].staleCount++;
    }
    const developerLoad = Object.entries(devMap)
      .map(([assignee, data]) => ({ assignee, ...data }))
      .sort((a, b) => b.count - a.count);

    // Stalest tickets
    const stalestTickets = allItems
      .filter((i) => (i as any).daysStale > 0)
      .sort((a, b) => ((b as any).daysStale ?? 0) - ((a as any).daysStale ?? 0))
      .slice(0, 10)
      .map((i) => ({
        id: (i as any).id,
        title: (i as any).title,
        assignee: (i as any).assignee,
        daysStale: (i as any).daysStale ?? 0,
      }));

    // Velocity estimate (simple: healthy = completed, rest = remaining)
    const completed = counts.healthy;
    const remaining = counts.total - counts.healthy;
    const pctDone = counts.total > 0 ? Math.round((completed / counts.total) * 100) : 0;

    const analytics: SprintAnalytics = {
      risk,
      counts,
      priorityDistribution,
      typeBreakdown,
      developerLoad,
      stalestTickets,
      velocityEstimate: { completed, remaining, pctDone },
    };

    return analytics;
  });
}
