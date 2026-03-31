"use client";

import { useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle, GitPullRequest, CheckCircle2, ExternalLink, X, Send, Zap } from "lucide-react";
import { IssueProps } from "./issue-feed";

interface IssueDetailModalProps {
  issue: IssueProps | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IssueDetailModal({ issue, open, onOpenChange }: IssueDetailModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    },
    [onOpenChange]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape]);

  if (!open || !issue) return null;

  const statusConfig: Record<string, { icon: any; color: string; bg: string }> = {
    stale: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
    blocked: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10" },
    review: { icon: GitPullRequest, color: "text-blue-400", bg: "bg-blue-500/10" },
    healthy: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  };
  const sc = statusConfig[issue.status] || statusConfig.healthy;
  const Icon = sc.icon;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-2xl bg-background border border-border/60 shadow-2xl overflow-hidden">
        {/* Status bar */}
        <div className={`h-1 w-full ${sc.bg.replace("/10", "/40")}`} />

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{issue.id}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-transparent uppercase ${sc.bg} ${sc.color}`}>
                <Icon size={10} className="mr-0.5" />
                {issue.status}
              </Badge>
              {issue.provider === "github" ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-zinc-800/50 text-zinc-400 border-zinc-700/50">PR</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-900/30 text-blue-400 border-blue-800/50">Jira</Badge>
              )}
              {issue.daysStale && (
                <span className="text-[10px] text-muted-foreground">{issue.daysStale} days</span>
              )}
            </div>
            <h2 className="text-base font-semibold leading-tight">{issue.title}</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors ml-4 mt-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Details */}
        <div className="p-5 space-y-4">
          {/* Assignee row */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Assignee</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-secondary text-[10px] flex items-center justify-center font-bold">
                  {issue.assignee.substring(0, 2).toUpperCase()}
                </div>
                <span className="font-medium">{issue.assignee}</span>
              </div>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Source</span>
              <span className="font-medium capitalize">{issue.provider}</span>
            </div>
          </div>

          {/* AI Analysis */}
          {issue.aiInsight && (
            <div className="bg-primary/5 border border-primary/15 rounded-lg p-3.5">
              <div className="flex items-center gap-2 text-primary font-medium text-xs mb-2">
                <span className="flex h-4 w-4 rounded-full bg-primary items-center justify-center">
                  <span className="text-primary-foreground text-[8px]">AI</span>
                </span>
                Sprint Guardian Analysis
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{issue.aiInsight}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-card/50 px-5 py-3 border-t border-border/40 flex items-center gap-2">
          <Button size="sm" className="text-xs gap-1.5 flex-1" variant="default">
            <Zap size={12} />
            Run AI Analysis
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5">
            <Send size={12} />
            Notify on Slack
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1"
            onClick={() => {
              const url = issue.provider === "github"
                ? `https://github.com/org/repo/pull/${issue.id.replace("PR-", "")}`
                : `https://jira.atlassian.net/browse/${issue.id}`;
              window.open(url, "_blank");
            }}
          >
            <ExternalLink size={12} />
          </Button>
        </div>
      </div>
    </div>
  );
}
