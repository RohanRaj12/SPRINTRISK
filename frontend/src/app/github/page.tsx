"use client";

import { useState } from "react";
import { GitPullRequest, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IssueDetailModal } from "@/components/features/issue-detail";
import { IssueProps } from "@/components/features/issue-feed";

const GITHUB_PRS: IssueProps[] = [
  {
    id: "PR-118",
    title: "Fix auth race condition in React router",
    assignee: "Sam",
    status: "review",
    provider: "github",
    aiInsight: "PR is approved but needs merge conflict resolution before it can be deployed.",
  },
  {
    id: "PR-114",
    title: "Add Token Vault caching layer",
    assignee: "Alex",
    status: "blocked",
    daysStale: 3,
    provider: "github",
    aiInsight: "CI is failing on the typecheck step. 2 files have type errors that need fixing.",
  },
  {
    id: "PR-121",
    title: "Upgrade Fastify to v5",
    assignee: "Jordan",
    status: "healthy",
    provider: "github",
  },
  {
    id: "PR-119",
    title: "Add Slack notification Block Kit formatting",
    assignee: "Morgan",
    status: "review",
    provider: "github",
    aiInsight: "Awaiting review from 2 reviewers for 3 days. Consider pinging them on Slack.",
  },
];

export default function GitHubPage() {
  const [selectedPR, setSelectedPR] = useState<IssueProps | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const filteredPRs = filter === "all"
    ? GITHUB_PRS
    : GITHUB_PRS.filter((pr) => pr.status === filter);

  return (
    <>
      <div className="h-full overflow-y-auto px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <GitPullRequest className="h-6 w-6 text-purple-400" />
              <h1 className="text-2xl font-semibold tracking-tight">GitHub PRs</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {GITHUB_PRS.length} open pull requests across repositories.
            </p>
          </div>

          <div className="flex gap-2">
            {["all", "review", "blocked", "healthy"].map((f) => (
              <Button
                key={f}
                variant={filter === f ? "secondary" : "ghost"}
                size="sm"
                className="text-xs capitalize"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All PRs" : f === "review" ? "Needs Review" : f}
              </Button>
            ))}
          </div>

          <div className="space-y-3 pb-8">
            {filteredPRs.map((pr) => {
              const statusIcon =
                pr.status === "review" ? <GitPullRequest size={14} className="text-blue-500" /> :
                pr.status === "blocked" ? <XCircle size={14} className="text-red-500" /> :
                <CheckCircle2 size={14} className="text-emerald-500" />;

              return (
                <button
                  type="button"
                  key={pr.id}
                  onClick={() => setSelectedPR(pr)}
                  className="group w-full text-left rounded-xl border border-border/50 bg-card/50 p-4 cursor-pointer transition-all hover:border-primary/30 hover:shadow-lg hover:bg-card"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{statusIcon}</div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-muted-foreground">{pr.id}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {pr.status}
                          </Badge>
                          {pr.daysStale && (
                            <span className="text-xs text-muted-foreground">{pr.daysStale}d stale</span>
                          )}
                        </div>
                        <h3 className="text-sm font-medium group-hover:text-primary transition-colors">
                          {pr.title}
                        </h3>
                        {pr.aiInsight && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            <span className="text-primary font-medium">AI:</span> {pr.aiInsight}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-secondary text-[10px] flex items-center justify-center font-medium shrink-0">
                      {pr.assignee.substring(0, 2).toUpperCase()}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <IssueDetailModal
        issue={selectedPR}
        open={!!selectedPR}
        onOpenChange={(open) => !open && setSelectedPR(null)}
      />
    </>
  );
}
