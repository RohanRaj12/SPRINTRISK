"use client";

import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Clock, GitPullRequest, ArrowUpRight, FolderSync } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IssueDetailModal } from "./issue-detail";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export interface IssueProps {
  id: string;
  title: string;
  assignee: string;
  status: "stale" | "healthy" | "blocked" | "review";
  daysStale?: number;
  provider: "jira" | "github";
  aiInsight?: string;
  url?: string;
}

function IssueCard({ issue, onClick }: { issue: IssueProps; onClick: () => void }) {
  const getStatusConfig = () => {
    switch (issue.status) {
      case "stale":
        return { icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" };
      case "blocked":
        return { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" };
      case "review":
        return { icon: GitPullRequest, color: "text-blue-500", bg: "bg-blue-500/10" };
      case "healthy":
      default:
        return { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full text-left overflow-hidden rounded-xl border border-border/50 bg-card/50 p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:bg-card cursor-pointer"
    >
      {/* Left status accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${config.bg.replace("/10", "/40")} group-hover:w-1 transition-all`} />

      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-full p-1.5 ${config.bg} ${config.color}`}>
            <Icon size={14} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">{issue.id}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-transparent ${config.bg} ${config.color} font-medium tracking-wide shadow-none uppercase`}>
                {issue.status}
              </Badge>
              {issue.daysStale && (
                <span className="text-xs text-muted-foreground">{issue.daysStale} days old</span>
              )}
            </div>
            <h3 className="text-sm font-medium leading-tight group-hover:text-primary transition-colors">
              {issue.title}
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-xs font-medium text-secondary-foreground shrink-0 border border-border/50 group-hover:border-primary/30 transition-colors">
          {issue.assignee.substring(0, 2).toUpperCase()}
        </div>
      </div>

      {issue.aiInsight && (
        <div className="mt-2 ml-9 pl-3 border-l-2 border-border/40 text-[13px] text-muted-foreground">
          <p className="leading-snug">
            <span className="font-semibold text-primary mr-1">AI:</span>
            {issue.aiInsight}
          </p>
          <div className="flex gap-3 mt-2">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
              onClick={(e) => { e.stopPropagation(); }}
            >
              Notify via Slack <ArrowUpRight size={10} />
            </span>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
              onClick={(e) => { e.stopPropagation(); }}
            >
              Request Review <ArrowUpRight size={10} />
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

export function IssueFeed() {
  const { isLoading: authLoading } = useAuth();
  const [selectedIssue, setSelectedIssue] = useState<IssueProps | null>(null);
  const [issues, setIssues] = useState<IssueProps[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authLoading) return;
    async function fetchIssues() {
      setLoading(true);
      try {
        const res = await api.getDashboardIssues();
        setIssues(res.data || []);
      } catch (err) {
        console.error("Failed to fetch issues", err);
      } finally {
        setLoading(false);
      }
    }
    fetchIssues();
  }, [authLoading]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1 tracking-tight">Sprint Health</h1>
            <p className="text-sm text-muted-foreground">
              {issues.length > 0 
                ? `${issues.length} issue${issues.length === 1 ? "" : "s"} tracked. AI analysis complete.`
                : "No issues tracked currently."}
            </p>
          </div>

          <div className="flex flex-col gap-3 pb-8">
            {issues.length === 0 ? (
              <EmptyState
                icon={FolderSync}
                title="No active issues found"
                description="Sprint Guardian couldn't find any open issues in your connected integrations. Connect Jira or GitHub in the Integrations tab to start tracking your sprint."
              />
            ) : (
              issues.map((issue) => (
                <IssueCard
                  key={`${issue.provider}-${issue.id}`}
                  issue={issue}
                  onClick={() => setSelectedIssue(issue)}
                />
              ))
            )}
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
