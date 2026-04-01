"use client";

import { useState, useEffect } from "react";
import {
  GitPullRequest,
  CheckSquare,
  MessageSquare,
  ArrowRight,
  AlertTriangle,
  Zap,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Correlation {
  id: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  entities: Array<{
    id: string;
    type: "jira" | "github" | "slack";
    label: string;
    status?: string;
  }>;
  insight: string;
  suggestedAction: string;
}

const DEMO_CORRELATIONS: Correlation[] = [
  {
    id: "corr-1",
    description: "Stale ticket linked to failing CI",
    severity: "high",
    confidence: 0.85,
    entities: [
      { id: "ENG-402", type: "jira", label: "Implement Token Vault caching layer", status: "stale" },
      { id: "PR-114", type: "github", label: "feat: add token vault cache", status: "CI failing" },
    ],
    insight: "ENG-402 hasn't moved in 4 days. The linked PR #114 has been failing CI on the typecheck step since Tuesday. The assignee (Alex) has no Slack activity in #engineering for 3 days.",
    suggestedAction: "DM Alex on Slack to check if they're blocked. The CI failure appears to be a type mismatch in token-vault.ts.",
  },
  {
    id: "corr-2",
    description: "Review bottleneck causing cascade delay",
    severity: "medium",
    confidence: 0.72,
    entities: [
      { id: "PR-121", type: "github", label: "Add rate limiting to API gateway", status: "awaiting review" },
      { id: "PR-118", type: "github", label: "Fix auth race condition", status: "approved" },
      { id: "ENG-399", type: "jira", label: "Design system dark mode", status: "blocked" },
    ],
    insight: "PR-121 has been awaiting review for 3 days from Morgan and Sam. PR-118 is approved but blocked by merge conflicts with PR-121. ENG-399 depends on the auth fix in PR-118.",
    suggestedAction: "Prioritize review of PR-121 to unblock the dependency chain. Notify Morgan and Sam in #code-review.",
  },
  {
    id: "corr-3",
    description: "Silent developer pattern detected",
    severity: "medium",
    confidence: 0.68,
    entities: [
      { id: "ENG-405", type: "jira", label: "Update Next.js to v15", status: "in progress" },
      { id: "@jordan", type: "slack", label: "Jordan — no messages in 2 days", status: "inactive" },
    ],
    insight: "Jordan has ENG-405 assigned (Next.js upgrade) but hasn't posted in any Slack channel for 2 days. The ticket status is 'in progress' but no commits have been pushed.",
    suggestedAction: "Check in with Jordan — they may be stuck on breaking changes in the Next.js migration or out of office.",
  },
];

const severityConfig = {
  low: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  medium: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  high: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  critical: { color: "text-red-500", bg: "bg-red-500/20", border: "border-red-500/30" },
};

const entityIcons = {
  jira: CheckSquare,
  github: GitPullRequest,
  slack: MessageSquare,
};

function CorrelationCard({ correlation }: { correlation: Correlation }) {
  const [expanded, setExpanded] = useState(false);
  const config = severityConfig[correlation.severity];

  return (
    <div
      className={`rounded-xl border ${config.border} bg-card/50 overflow-hidden transition-all duration-200 hover:shadow-lg`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-full p-1.5 ${config.bg} ${config.color}`}>
            <Zap size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 border-transparent ${config.bg} ${config.color} font-medium tracking-wide shadow-none uppercase`}
              >
                {correlation.severity}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {Math.round(correlation.confidence * 100)}% confidence
              </span>
            </div>
            <h3 className="text-sm font-medium">{correlation.description}</h3>

            {/* Entity chain */}
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {correlation.entities.map((entity, i) => {
                const Icon = entityIcons[entity.type];
                return (
                  <span key={entity.id} className="contents">
                    <span className="inline-flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-0.5 text-xs">
                      <Icon size={12} className="text-muted-foreground" />
                      <span className="font-mono">{entity.id}</span>
                    </span>
                    {i < correlation.entities.length - 1 && (
                      <ArrowRight size={12} className="text-muted-foreground mx-0.5" />
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
          {/* Detailed insight */}
          <div className="ml-9">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              <span className="font-semibold text-primary mr-1">AI Analysis:</span>
              {correlation.insight}
            </p>
          </div>

          {/* Entity details */}
          <div className="ml-9 space-y-1.5">
            {correlation.entities.map((entity) => {
              const Icon = entityIcons[entity.type];
              return (
                <div key={entity.id} className="flex items-center gap-2 text-xs">
                  <Icon size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-mono text-muted-foreground">{entity.id}</span>
                  <span className="text-foreground truncate">{entity.label}</span>
                  {entity.status && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto shrink-0">
                      {entity.status}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>

          {/* Suggested action */}
          <div className="ml-9 rounded-lg bg-primary/5 border border-primary/10 p-3">
            <p className="text-[13px]">
              <span className="font-semibold text-primary mr-1">Suggested Action:</span>
              <span className="text-muted-foreground">{correlation.suggestedAction}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function CorrelationPanel() {
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAudit, setRunningAudit] = useState(false);

  useEffect(() => {
    setCorrelations(DEMO_CORRELATIONS);
    setLoading(false);
  }, []);

  const triggerAudit = async () => {
    setRunningAudit(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/audit/trigger`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      if (res.ok) {
        const data = await res.json();
        // Extract correlations from the orchestrator response
        if (data.phases?.diagnosis?.correlations > 0) {
          // Refresh correlations from the run data
          setCorrelations(DEMO_CORRELATIONS); // In demo, keep the static data
        }
      }
    } catch (err) {
      console.error("Audit trigger failed:", err);
    } finally {
      setRunningAudit(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-1 tracking-tight flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Cross-System Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-detected correlations across Jira, GitHub, and Slack. Click a card for details.
            </p>
          </div>
          <button
            onClick={triggerAudit}
            disabled={runningAudit}
            className="flex items-center gap-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={runningAudit ? "animate-spin" : ""} />
            {runningAudit ? "Analyzing..." : "Run Audit"}
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/50 bg-card/50 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{correlations.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Correlations Found</div>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/50 p-3 text-center">
            <div className="text-2xl font-bold text-red-400">
              {correlations.filter((c) => c.severity === "high" || c.severity === "critical").length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">High Severity</div>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/50 p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">
              {correlations.reduce((sum, c) => sum + c.entities.length, 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Linked Entities</div>
          </div>
        </div>

        {/* Correlation cards */}
        <div className="space-y-3 pb-8">
          {correlations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No cross-system correlations detected yet.</p>
              <p className="text-xs mt-1">Run an audit to analyze your sprint data.</p>
            </div>
          ) : (
            correlations.map((c) => <CorrelationCard key={c.id} correlation={c} />)
          )}
        </div>
      </div>
    </div>
  );
}
