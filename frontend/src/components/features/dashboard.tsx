"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Clock,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Zap,
  ListTodo,
  Bug,
  Wrench,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Issue {
  id: string;
  title: string;
  assignee: string;
  status: "stale" | "healthy" | "blocked" | "review";
  daysStale?: number;
  provider: "jira" | "github";
  aiInsight?: string;
  priority?: string;
  type?: string;
}

interface AuditEntry {
  id: string;
  description: string;
  category: string;
  severity: string;
  timestamp?: string;
  createdAt?: string;
}

function computeRiskScore(issues: Issue[]): number {
  if (issues.length === 0) return 100;
  let score = 100;
  const stale = issues.filter((i) => i.status === "stale").length;
  const blocked = issues.filter((i) => i.status === "blocked").length;
  const review = issues.filter((i) => i.status === "review").length;
  score -= blocked * 15;
  score -= stale * 8;
  score -= review * 3;
  return Math.max(0, Math.min(100, score));
}

function getRiskColor(score: number) {
  if (score >= 80) return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Healthy" };
  if (score >= 60) return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", label: "At Risk" };
  if (score >= 40) return { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", label: "Warning" };
  return { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", label: "Critical" };
}

export function Dashboard() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const [issuesRes, logsRes] = await Promise.all([
        api.getDashboardIssues(),
        api.getDashboardAuditLog(),
      ]);
      setIssues(issuesRes.data || []);
      setAuditLogs(logsRes.data || []);
      // Collect warnings from all responses
      const allWarnings: string[] = [];
      if (issuesRes.warnings) allWarnings.push(...issuesRes.warnings);
      if (logsRes.warnings) allWarnings.push(...logsRes.warnings);
      // Deduplicate
      setWarnings([...new Set(allWarnings)]);
    } catch (err) {
      console.error("Dashboard fetch failed", err);
    } finally {
      setLoading(false);
    }
  }

  // Wait for auth to finish loading before fetching dashboard data
  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading]);

  const handleRunAudit = async () => {
    setAuditing(true);
    setAuditError(null);
    try {
      const result = await api.triggerAudit();
      // Refresh dashboard data after audit completes
      await fetchData();
      setAuditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audit failed. Check your integrations and try again.";
      setAuditError(message);
      setAuditing(false);
    }
  };

  const riskScore = computeRiskScore(issues);
  const risk = getRiskColor(riskScore);

  const staleCount = issues.filter((i) => i.status === "stale").length;
  const blockedCount = issues.filter((i) => i.status === "blocked").length;
  const reviewCount = issues.filter((i) => i.status === "review").length;
  const healthyCount = issues.filter((i) => i.status === "healthy").length;

  const jiraCount = issues.filter((i) => i.provider === "jira").length;
  const githubCount = issues.filter((i) => i.provider === "github").length;

  const topRisks = issues
    .filter((i) => i.status === "blocked" || i.status === "stale")
    .sort((a, b) => (b.daysStale ?? 0) - (a.daysStale ?? 0))
    .slice(0, 5);

  const recentLogs = auditLogs.slice(0, 5);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Sprint risk intelligence at a glance</p>
          </div>
          <Button size="sm" onClick={handleRunAudit} disabled={auditing} className="gap-1.5 text-xs">
            {auditing ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            {auditing ? "Running..." : "Run Audit"}
          </Button>
        </div>

        {auditError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {auditError}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Risk Score + Metric Cards */}
        <div className="grid grid-cols-6 gap-3">
          {/* Risk Score - spans 2 cols */}
          <Card className={`col-span-2 p-4 ${risk.bg} border ${risk.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className={risk.text} />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sprint Risk</span>
            </div>
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold tabular-nums ${risk.text}`}>{riskScore}</span>
              <span className="text-sm text-muted-foreground mb-1">/100</span>
            </div>
            <Badge variant="outline" className={`mt-2 text-[10px] ${risk.bg} ${risk.text} border-transparent uppercase`}>
              {risk.label}
            </Badge>
          </Card>

          {/* Metric cards */}
          <MetricCard icon={AlertCircle} label="Blocked" value={blockedCount} color="text-red-400" bgColor="bg-red-500/10" />
          <MetricCard icon={Clock} label="Stale" value={staleCount} color="text-amber-400" bgColor="bg-amber-500/10" />
          <MetricCard icon={GitPullRequest} label="Needs Review" value={reviewCount} color="text-blue-400" bgColor="bg-blue-500/10" />
          <MetricCard icon={CheckCircle2} label="Healthy" value={healthyCount} color="text-emerald-400" bgColor="bg-emerald-500/10" />
        </div>

        {/* Two columns: Top Risks + Sprint Breakdown */}
        <div className="grid grid-cols-5 gap-4">
          {/* Top Risks */}
          <div className="col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-400" />
                Top Risks
              </h2>
              <Link href="/issues" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                View all <ArrowRight size={10} />
              </Link>
            </div>
            <div className="space-y-1.5">
              {topRisks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No critical risks detected</p>
              ) : (
                topRisks.map((issue) => (
                  <div key={`${issue.provider}-${issue.id}`} className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5">
                    {issue.status === "blocked" ? (
                      <AlertCircle size={14} className="text-red-400 shrink-0" />
                    ) : (
                      <Clock size={14} className="text-amber-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{issue.id}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase">{issue.status}</Badge>
                        {issue.daysStale && <span className="text-[10px] text-muted-foreground">{issue.daysStale}d</span>}
                      </div>
                      <p className="text-xs font-medium truncate mt-0.5">{issue.title}</p>
                    </div>
                    <div className="w-5 h-5 rounded-full bg-secondary text-[8px] flex items-center justify-center font-medium shrink-0">
                      {issue.assignee.substring(0, 2).toUpperCase()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sprint Breakdown */}
          <div className="col-span-2 space-y-4">
            {/* Source breakdown */}
            <Card className="p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sources</h3>
              <div className="space-y-2">
                <BreakdownRow label="Jira tickets" count={jiraCount} total={issues.length} color="bg-blue-500" />
                <BreakdownRow label="GitHub PRs" count={githubCount} total={issues.length} color="bg-zinc-400" />
              </div>
            </Card>

            {/* Status breakdown */}
            <Card className="p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Status</h3>
              <div className="space-y-2">
                <BreakdownRow label="Blocked" count={blockedCount} total={issues.length} color="bg-red-500" />
                <BreakdownRow label="Stale" count={staleCount} total={issues.length} color="bg-amber-500" />
                <BreakdownRow label="Review" count={reviewCount} total={issues.length} color="bg-blue-500" />
                <BreakdownRow label="Healthy" count={healthyCount} total={issues.length} color="bg-emerald-500" />
              </div>
            </Card>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
            <Link href="/audit-log" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              Full log <ArrowRight size={10} />
            </Link>
          </div>
          <div className="space-y-1">
            {recentLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No recent activity</p>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 text-xs py-2 border-b border-border/30 last:border-0">
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    log.severity === "error" || log.severity === "critical" ? "bg-red-400" :
                    log.severity === "warning" ? "bg-amber-400" : "bg-blue-400"
                  }`} />
                  <span className="text-muted-foreground flex-1 truncate">{log.description}</span>
                  <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">
                    {new Date(log.timestamp || log.createdAt || "").toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color, bgColor }: {
  icon: any;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <div className={`rounded-md p-1 ${bgColor}`}>
          <Icon size={12} className={color} />
        </div>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </Card>
  );
}

function BreakdownRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{count} <span className="text-muted-foreground/60">({pct}%)</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
