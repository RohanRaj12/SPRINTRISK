"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Clock, AlertCircle, GitPullRequest, CheckCircle2, ArrowRight, MessageSquare, ExternalLink, Send } from "lucide-react";
import { IssueProps } from "./issue-feed";

interface IssueDetailModalProps {
  issue: IssueProps | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IssueDetailModal({ issue, open, onOpenChange }: IssueDetailModalProps) {
  if (!issue) return null;

  const getStatusConfig = () => {
    switch (issue.status) {
      case "stale":
        return { icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", barBg: "bg-amber-500/40" };
      case "blocked":
        return { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", barBg: "bg-red-500/40" };
      case "review":
        return { icon: GitPullRequest, color: "text-blue-500", bg: "bg-blue-500/10", barBg: "bg-blue-500/40" };
      case "healthy":
      default:
        return { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", barBg: "bg-emerald-500/40" };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const externalUrl = issue.provider === "github"
    ? `https://github.com/your-org/your-repo/pull/${issue.id.replace("PR-", "")}`
    : `https://your-company.atlassian.net/browse/${issue.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border-border/50 gap-0">
        {/* Color bar at top */}
        <div className={`h-1.5 w-full ${config.barBg}`} />

        <div className="p-6 space-y-5">
          {/* Header */}
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                {issue.id}
              </span>
              <Badge variant="outline" className={`text-xs px-2 py-0.5 border-transparent ${config.bg} ${config.color} uppercase`}>
                <Icon size={12} className="mr-1" />
                {issue.status}
              </Badge>
              {issue.provider === "github" ? (
                <Badge variant="outline" className="text-xs bg-zinc-800 text-zinc-300 border-zinc-700">GitHub PR</Badge>
              ) : (
                <Badge variant="outline" className="text-xs bg-blue-900/30 text-blue-400 border-blue-800/50">Jira Ticket</Badge>
              )}
              {issue.daysStale && (
                <span className="text-xs text-muted-foreground">{issue.daysStale} days stale</span>
              )}
            </div>
            <DialogTitle className="text-lg leading-snug font-semibold text-foreground">
              {issue.title}
            </DialogTitle>
          </DialogHeader>

          {/* Details row */}
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Assignee</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-secondary text-[10px] flex items-center justify-center font-medium">
                  {issue.assignee.substring(0, 2).toUpperCase()}
                </div>
                <span className="font-medium">{issue.assignee}</span>
              </div>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Priority</span>
              <span className="font-medium">High</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">Oct 24, 2023</span>
            </div>
          </div>

          {/* AI Analysis */}
          {issue.aiInsight && (
            <div className="bg-primary/5 border border-primary/15 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <span className="flex h-5 w-5 rounded-full bg-primary items-center justify-center shrink-0">
                  <span className="text-primary-foreground text-[10px] leading-none">AI</span>
                </span>
                Sprint Guardian Analysis
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {issue.aiInsight}
              </p>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-primary/10">
                <Button variant="secondary" size="sm" className="h-7 text-xs bg-background hover:bg-muted border border-border/50">
                  <Send size={12} className="mr-1.5" />
                  Draft Slack Message
                </Button>
                {issue.status === "review" && (
                  <Button variant="secondary" size="sm" className="h-7 text-xs bg-background hover:bg-muted border border-border/50">
                    Assign Reviewer
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</h4>
            <div className="text-sm text-foreground/80 leading-relaxed bg-muted/30 p-4 rounded-lg border border-border/40">
              Requires investigation into the {issue.provider === "github" ? "build pipeline" : "core components"}.
              Make sure to check the dependent services before proceeding.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-muted/50 px-6 py-3 border-t border-border/50 flex justify-between items-center">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            <MessageSquare size={14} className="mr-1.5" />
            Comment
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => window.open(externalUrl, "_blank")}
            >
              Open in {issue.provider === "github" ? "GitHub" : "Jira"}
              <ExternalLink size={12} className="ml-1.5" />
            </Button>
            <Button size="sm" className="text-xs">
              Take Action
              <ArrowRight size={12} className="ml-1.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
