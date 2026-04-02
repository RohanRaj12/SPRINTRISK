"use client";

import { useState, useEffect } from "react";
import { ListTodo, CheckSquare, GitPullRequest, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IssueDetailModal } from "@/components/features/issue-detail";
import { type IssueProps } from "@/components/features/issue-feed";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";

export default function IssuesPage() {
  const [selectedIssue, setSelectedIssue] = useState<IssueProps | null>(null);
  const [tab, setTab] = useState<"all" | "jira" | "github">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [issues, setIssues] = useState<IssueProps[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        const [issuesRes, prsRes] = await Promise.all([
          api.getDashboardIssues(),
          api.getDashboardPrs(),
        ]);
        setIssues([...(issuesRes.data || []), ...(prsRes.data || [])]);
      } catch (err) {
        console.error("Failed to fetch issues", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const filtered = issues.filter((i) => {
    if (tab === "jira" && i.provider !== "jira") return false;
    if (tab === "github" && i.provider !== "github") return false;
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    return true;
  });

  const counts = {
    all: issues.length,
    jira: issues.filter((i) => i.provider === "jira").length,
    github: issues.filter((i) => i.provider === "github").length,
  };

  const statusCounts = {
    stale: issues.filter((i) => i.status === "stale").length,
    blocked: issues.filter((i) => i.status === "blocked").length,
    review: issues.filter((i) => i.status === "review").length,
    healthy: issues.filter((i) => i.status === "healthy").length,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "stale": return <Clock size={14} className="text-amber-500" />;
      case "blocked": return <AlertCircle size={14} className="text-red-500" />;
      case "review": return <GitPullRequest size={14} className="text-blue-500" />;
      default: return <CheckCircle2 size={14} className="text-emerald-500" />;
    }
  };

  return (
    <>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/40">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                <ListTodo size={20} />
                Issues & Pull Requests
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {counts.all} items across Jira and GitHub
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-3">
            {([
              { key: "all", label: `All (${counts.all})`, icon: ListTodo },
              { key: "jira", label: `Jira (${counts.jira})`, icon: CheckSquare },
              { key: "github", label: `GitHub (${counts.github})`, icon: GitPullRequest },
            ] as const).map((t) => (
              <Button
                key={t.key}
                variant={tab === t.key ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-8 gap-1.5"
                onClick={() => setTab(t.key)}
              >
                <t.icon size={13} />
                {t.label}
              </Button>
            ))}
          </div>

          {/* Status filters */}
          <div className="flex gap-3 text-xs">
            {(["all", "stale", "blocked", "review", "healthy"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                  statusFilter === s ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s !== "all" && getStatusIcon(s)}
                <span className="capitalize">{s}</span>
                {s !== "all" && <span className="text-muted-foreground/60 ml-0.5">{statusCounts[s]}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="px-6 py-4 space-y-2 pb-8">
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No items found"
              description="Adjust your filters or connect integrations in Settings."
            />
          ) : (
            filtered.map((issue) => (
              <button
                key={`${issue.provider}-${issue.id}`}
                type="button"
                onClick={() => setSelectedIssue(issue)}
                className="group w-full text-left rounded-lg border border-border/40 bg-card/30 hover:bg-card hover:border-border/60 p-3 transition-all"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(issue.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-mono text-muted-foreground">{issue.id}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 uppercase">{issue.status}</Badge>
                      {issue.provider === "github" && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-zinc-800/50 text-zinc-400 border-zinc-700/50">PR</Badge>
                      )}
                      {issue.daysStale && (
                        <span className="text-[10px] text-muted-foreground">{issue.daysStale}d</span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium group-hover:text-primary transition-colors truncate">{issue.title}</h3>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-secondary text-[9px] flex items-center justify-center font-medium shrink-0">
                    {(issue.assignee || "Unassigned").substring(0, 2).toUpperCase()}
                  </div>
                </div>
                {issue.aiInsight && (
                  <p className="mt-1.5 ml-[26px] text-[11px] text-muted-foreground line-clamp-1">
                    <span className="text-primary font-medium">AI:</span> {issue.aiInsight}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <IssueDetailModal
        issue={selectedIssue}
        open={!!selectedIssue}
        onOpenChange={(open) => !open && setSelectedIssue(null)}
      />
    </>
  );
}
