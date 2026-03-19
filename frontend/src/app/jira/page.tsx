"use client";

import { useState } from "react";
import { CheckSquare, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IssueDetailModal } from "@/components/features/issue-detail";
import { IssueProps } from "@/components/features/issue-feed";

const JIRA_ISSUES: IssueProps[] = [
  {
    id: "ENG-402",
    title: "Implement Token Vault caching layer",
    assignee: "Alex",
    status: "stale",
    daysStale: 4,
    provider: "jira",
    aiInsight: "This ticket hasn't moved in 4 days. The associated PR #114 is failing CI on the typecheck step.",
  },
  {
    id: "ENG-399",
    title: "Design system dark mode implementation",
    assignee: "Taylor",
    status: "blocked",
    daysStale: 2,
    provider: "jira",
    aiInsight: "Blocked waiting on final color palette approval from product team.",
  },
  {
    id: "ENG-405",
    title: "Update Next.js to v15",
    assignee: "Jordan",
    status: "healthy",
    provider: "jira",
  },
  {
    id: "ENG-410",
    title: "Add rate limiting to API endpoints",
    assignee: "Morgan",
    status: "stale",
    daysStale: 6,
    provider: "jira",
    aiInsight: "No progress in 6 days. Assignee may need to be reminded or reassigned.",
  },
  {
    id: "ENG-412",
    title: "Migrate database to PostgreSQL 16",
    assignee: "Casey",
    status: "healthy",
    provider: "jira",
  },
];

export default function JiraPage() {
  const [selectedIssue, setSelectedIssue] = useState<IssueProps | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const filteredIssues = filter === "all"
    ? JIRA_ISSUES
    : JIRA_ISSUES.filter((i) => i.status === filter);

  return (
    <>
      <div className="h-full overflow-y-auto px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <CheckSquare className="h-6 w-6 text-blue-400" />
              <h1 className="text-2xl font-semibold tracking-tight">Jira Issues</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {JIRA_ISSUES.length} tickets across the current sprint.
            </p>
          </div>

          <div className="flex gap-2">
            {["all", "stale", "blocked", "healthy"].map((f) => (
              <Button
                key={f}
                variant={filter === f ? "secondary" : "ghost"}
                size="sm"
                className="text-xs capitalize"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All Issues" : f}
              </Button>
            ))}
          </div>

          <div className="space-y-3 pb-8">
            {filteredIssues.map((issue) => {
              const statusIcon =
                issue.status === "stale" ? <Clock size={14} className="text-amber-500" /> :
                issue.status === "blocked" ? <AlertCircle size={14} className="text-red-500" /> :
                <CheckSquare size={14} className="text-emerald-500" />;

              return (
                <button
                  type="button"
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className="group w-full text-left rounded-xl border border-border/50 bg-card/50 p-4 cursor-pointer transition-all hover:border-primary/30 hover:shadow-lg hover:bg-card"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{statusIcon}</div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-muted-foreground">{issue.id}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {issue.status}
                          </Badge>
                          {issue.daysStale && (
                            <span className="text-xs text-muted-foreground">{issue.daysStale}d stale</span>
                          )}
                        </div>
                        <h3 className="text-sm font-medium group-hover:text-primary transition-colors">
                          {issue.title}
                        </h3>
                        {issue.aiInsight && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            <span className="text-primary font-medium">AI:</span> {issue.aiInsight}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-secondary text-[10px] flex items-center justify-center font-medium shrink-0">
                      {issue.assignee.substring(0, 2).toUpperCase()}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
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
