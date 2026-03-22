"use client";

import { useState } from "react";
import {
  Activity,
  Bot,
  Shield,
  Webhook,
  Lock,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──

interface AuditEntry {
  id: string;
  action: string;
  category: "agent" | "approval" | "integration" | "auth" | "system";
  severity: "info" | "warning" | "error" | "critical";
  description: string;
  metadata: Record<string, unknown>;
  userId?: string;
  runId?: string;
  createdAt: string;
}

// ── Sample Data ──

const SAMPLE_AUDIT_LOG: AuditEntry[] = [
  {
    id: "aud-001",
    action: "agent.phase.observe",
    category: "agent",
    severity: "info",
    description: "Agent started observation phase — querying Jira and GitHub for sprint data.",
    metadata: { phase: "observe", runId: "run-abc-123" },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:30:00Z",
  },
  {
    id: "aud-002",
    action: "integration.jira.query",
    category: "integration",
    severity: "info",
    description: "Jira API: Queried project ENG for open issues. Found 12 issues, 3 stale.",
    metadata: { provider: "jira", project: "ENG", issuesFound: 12, staleCount: 3 },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:30:02Z",
  },
  {
    id: "aud-003",
    action: "integration.github.query",
    category: "integration",
    severity: "info",
    description: "GitHub API: Checked acme-corp/backend-api. 4 open PRs, 1 failing CI.",
    metadata: { provider: "github", repo: "acme-corp/backend-api", prs: 4, failing: 1 },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:30:04Z",
  },
  {
    id: "aud-004",
    action: "agent.phase.diagnose",
    category: "agent",
    severity: "info",
    description: "Diagnosis complete: Root cause identified as blocked PRs causing stale tickets.",
    metadata: { phase: "diagnose", rootCause: "PR #114 CI failure blocking ENG-402" },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:30:06Z",
  },
  {
    id: "aud-005",
    action: "agent.phase.plan",
    category: "agent",
    severity: "info",
    description: "Generated 4-step execution plan with confidence 0.87.",
    metadata: { phase: "plan", steps: 4, confidence: 0.87, autoSteps: 2, approvalSteps: 2 },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:30:08Z",
  },
  {
    id: "aud-006",
    action: "agent.step.completed",
    category: "agent",
    severity: "info",
    description: 'Step "jira_analyzer" completed successfully — found 3 stale tickets.',
    metadata: { tool: "jira_analyzer", staleCount: 3, duration: "1.2s" },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:30:12Z",
  },
  {
    id: "aud-007",
    action: "approval.created",
    category: "approval",
    severity: "warning",
    description: "Approval required: Agent wants to send Slack DM to Alex about ENG-402.",
    metadata: { approvalId: "apv-001", riskLevel: "high", target: "alex@company.com" },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:30:14Z",
  },
  {
    id: "aud-008",
    action: "approval.approved",
    category: "approval",
    severity: "info",
    description: 'Step approved by rohan@company.com — "Looks good, send the reminder."',
    metadata: { approvalId: "apv-001", decidedBy: "rohan@company.com" },
    userId: "auth0|user-rohan",
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:35:20Z",
  },
  {
    id: "aud-009",
    action: "integration.slack.dm",
    category: "integration",
    severity: "info",
    description: "Slack DM sent to Alex regarding stale ticket ENG-402.",
    metadata: { provider: "slack", target: "alex@company.com", messageId: "msg-xyz" },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:35:22Z",
  },
  {
    id: "aud-010",
    action: "agent.step.failed",
    category: "agent",
    severity: "error",
    description: 'Step "slack_notifier" failed: Rate limited by Slack API. Retrying in 5s.',
    metadata: { tool: "slack_notifier", error: "429 Too Many Requests", retryIn: "5s" },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:35:25Z",
  },
  {
    id: "aud-011",
    action: "auth.token_refresh",
    category: "auth",
    severity: "info",
    description: "M2M management token refreshed for Auth0 API access.",
    metadata: { expiresIn: "86400s" },
    createdAt: "2026-03-22T10:00:00Z",
  },
  {
    id: "aud-012",
    action: "agent.phase.learn",
    category: "agent",
    severity: "info",
    description: "Learning phase: Stored 3 new patterns and 4 outcomes from this run.",
    metadata: { phase: "learn", patternsStored: 3, outcomesStored: 4 },
    runId: "run-abc-123",
    createdAt: "2026-03-22T10:36:00Z",
  },
];

// ── Configuration ──

const CATEGORY_CONFIG = {
  agent: { icon: Bot, color: "text-violet-400", bg: "bg-violet-500/10", label: "Agent" },
  approval: { icon: Shield, color: "text-amber-400", bg: "bg-amber-500/10", label: "Approval" },
  integration: { icon: Webhook, color: "text-blue-400", bg: "bg-blue-500/10", label: "Integration" },
  auth: { icon: Lock, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Auth" },
  system: { icon: Server, color: "text-zinc-400", bg: "bg-zinc-500/10", label: "System" },
};

const SEVERITY_CONFIG = {
  info: { icon: Info, color: "text-blue-400", dot: "bg-blue-400" },
  warning: { icon: AlertTriangle, color: "text-amber-400", dot: "bg-amber-400" },
  error: { icon: XCircle, color: "text-red-400", dot: "bg-red-400" },
  critical: { icon: AlertTriangle, color: "text-red-500", dot: "bg-red-500" },
};

// ── Audit Entry Component ──

function AuditEntryRow({ entry, isLast }: { entry: AuditEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_CONFIG[entry.category];
  const sev = SEVERITY_CONFIG[entry.severity];
  const CatIcon = cat.icon;

  const time = new Date(entry.createdAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className="flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center shrink-0 w-6">
        <div className={`h-2.5 w-2.5 rounded-full ${sev.dot} ring-4 ring-background mt-1.5 shrink-0`} />
        {!isLast && <div className="w-px flex-1 bg-border/40" />}
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className={`flex-1 pb-5 ${isLast ? "" : ""}`}
      >
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left group"
        >
          <div className="flex items-start gap-3">
            <div className={`shrink-0 rounded-md p-1.5 ${cat.bg}`}>
              <CatIcon size={12} className={cat.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-[10px] font-mono text-muted-foreground">{time}</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-0 uppercase border-transparent ${cat.bg} ${cat.color}`}
                >
                  {cat.label}
                </Badge>
                {entry.severity !== "info" && (
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 uppercase border-transparent ${
                      entry.severity === "error" || entry.severity === "critical"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {entry.severity}
                  </Badge>
                )}
                {entry.runId && (
                  <span className="text-[10px] text-muted-foreground/50 font-mono">
                    {entry.runId.slice(0, 11)}
                  </span>
                )}
              </div>
              <p className="text-sm leading-snug group-hover:text-primary transition-colors">
                {entry.description}
              </p>
            </div>
            <ChevronDown
              size={14}
              className={`shrink-0 text-muted-foreground/40 transition-transform mt-1 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {/* Expanded metadata */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="ml-9 mt-2 overflow-hidden"
            >
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3 font-mono text-[11px]">
                <div className="text-muted-foreground mb-1 font-sans text-[10px] uppercase tracking-wider font-medium">
                  Metadata
                </div>
                <pre className="text-foreground/70 whitespace-pre-wrap">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ── Page Component ──

export default function AuditLogPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const filteredEntries = SAMPLE_AUDIT_LOG.filter((e) => {
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    if (severityFilter !== "all" && e.severity !== severityFilter) return false;
    return true;
  }).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const categoryCounts = SAMPLE_AUDIT_LOG.reduce<Record<string, number>>(
    (acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Activity className="h-6 w-6 text-violet-400" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Audit Timeline
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Complete chronological log of all agent actions, approvals, and system events.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3">
          {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map((key) => {
            const cfg = CATEGORY_CONFIG[key];
            const Icon = cfg.icon;
            return (
              <Card
                key={key}
                className={`p-3 bg-card/50 border-border/50 cursor-pointer transition-all hover:border-primary/30 ${
                  categoryFilter === key ? "ring-1 ring-primary/30" : ""
                }`}
                onClick={() =>
                  setCategoryFilter(categoryFilter === key ? "all" : key)
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className={cfg.color} />
                  <span className="text-xs font-medium capitalize">{cfg.label}</span>
                </div>
                <span className="text-lg font-semibold">{categoryCounts[key] ?? 0}</span>
              </Card>
            );
          })}
        </div>

        {/* Severity Filters */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-1">Severity:</span>
          {["all", "info", "warning", "error", "critical"].map((s) => (
            <Button
              key={s}
              variant={severityFilter === s ? "secondary" : "ghost"}
              size="sm"
              className="text-xs capitalize h-7 px-2"
              onClick={() => setSeverityFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        {/* Timeline */}
        <div className="pb-8">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-16">
              <Activity className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No audit events match the current filters.</p>
            </div>
          ) : (
            filteredEntries.map((entry, index) => (
              <AuditEntryRow
                key={entry.id}
                entry={entry}
                isLast={index === filteredEntries.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
