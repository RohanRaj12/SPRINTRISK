"use client";

import { useState, useEffect } from "react";
import { GitPullRequest, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IssueDetailModal } from "@/components/features/issue-detail";
import { IssueProps } from "@/components/features/issue-feed";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function GitHubPage() {
  const { isLoading: authLoading } = useAuth();
  const [selectedPR, setSelectedPR] = useState<IssueProps | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [prs, setPrs] = useState<IssueProps[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authLoading) return;
    async function fetchPRs() {
      setLoading(true);
      try {
        const res = await api.getDashboardPrs();
        // Map PRItem (backend shape) to IssueProps (frontend shape)
        const mapped: IssueProps[] = (res.data || []).map((pr: any) => ({
          id: `PR-${pr.number}`,
          title: pr.title,
          assignee: pr.author || "Unknown",
          status: pr.ageInDays >= 3
            ? "stale"
            : pr.pendingReviewers?.length > 0
              ? "review"
              : "healthy",
          daysStale: pr.ageInDays >= 3 ? pr.ageInDays : undefined,
          provider: "github" as const,
          url: pr.url,
        }));
        setPrs(mapped);
      } catch (err) {
        console.error("Failed to fetch PRs", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPRs();
  }, [authLoading]);

  const filteredPRs = filter === "all"
    ? prs
    : prs.filter((pr) => pr.status === filter);

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
              {prs.length} open pull requests across repositories.
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
            {loading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : prs.length === 0 ? (
              <EmptyState
                icon={GitPullRequest}
                title="No Pull Requests Found"
                description="There are currently no open pull requests in the tracked repositories."
              />
            ) : filteredPRs.length === 0 ? (
              <div className="text-center py-24 px-4 rounded-xl border border-dashed border-border/60 bg-card/20 min-h-[250px] flex flex-col items-center justify-center">
                <GitPullRequest className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <h3 className="text-lg font-medium text-foreground/80">No {filter} PRs</h3>
                <p className="text-sm text-muted-foreground/80 mt-2">
                  Try changing your filter to see other PRs.
                </p>
              </div>
            ) : (
              filteredPRs.map((pr) => {
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
              })
            )}
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
