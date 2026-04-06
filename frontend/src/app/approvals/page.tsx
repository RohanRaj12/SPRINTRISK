"use client";

import { useState, useEffect } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  MessageSquare,
  Zap,
  Eye,
  Inbox
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

// ── Types ──

interface ApprovalItem {
  id: string;
  title: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskReasoning: string;
  actionPreview: {
    tool: string;
    target: string;
    action: string;
    parameters: Record<string, string>;
  };
  runId: string;
  requestedAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "rejected" | "expired";
  agentReasoning: string;
}

// ── Risk Configuration ──

const RISK_CONFIG = {
  low: {
    icon: Shield,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    label: "Low Risk",
    dot: "bg-emerald-500",
  },
  medium: {
    icon: ShieldAlert,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    label: "Medium Risk",
    dot: "bg-amber-500",
  },
  high: {
    icon: ShieldX,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    label: "High Risk",
    dot: "bg-orange-500",
  },
  critical: {
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    label: "Critical",
    dot: "bg-red-500",
  },
};

// ── Approval Card Component ──

function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: {
  approval: ApprovalItem;
  onApprove: (id: string, note?: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);

  const risk = RISK_CONFIG[approval.riskLevel];
  const RiskIcon = risk.icon;

  const timeAgo = getTimeAgo(approval.requestedAt);
  const expiresIn = getTimeUntil(approval.expiresAt);

  if (decided) {
    return (
      <motion.div
        initial={{ opacity: 1, height: "auto" }}
        animate={{ opacity: 0.6, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="rounded-xl border border-border/30 bg-card/30 p-4"
      >
        <div className="flex items-center gap-3">
          {decided === "approved" ? (
            <CheckCircle2 className="text-emerald-500" size={20} />
          ) : (
            <XCircle className="text-red-500" size={20} />
          )}
          <span className="text-sm font-medium">
            {decided === "approved" ? "Approved" : "Rejected"}: {approval.title}
          </span>
          <Badge variant="outline" className="ml-auto text-[10px] uppercase">
            {decided}
          </Badge>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, height: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Card className={`relative overflow-hidden border-border/50 bg-card/50 transition-all hover:shadow-lg ${expanded ? "ring-1 ring-primary/20" : ""}`}>
        {/* Risk accent bar */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${risk.dot}`} />

        <div className="p-5 pl-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-start gap-3 flex-1">
              <div className={`mt-0.5 rounded-lg p-2 ${risk.bg}`}>
                <RiskIcon size={16} className={risk.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 uppercase font-semibold border-transparent ${risk.bg} ${risk.color}`}
                  >
                    {risk.label}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock size={10} />
                    {timeAgo}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60">
                    Expires {expiresIn}
                  </span>
                </div>
                <h3 className="text-sm font-semibold leading-snug">{approval.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {approval.description}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              <Eye size={14} className="mr-1" />
              {expanded ? "Less" : "Details"}
              <ChevronRight
                size={14}
                className={`ml-1 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </Button>
          </div>

          {/* Action Preview (always visible) */}
          <div className="ml-11 mb-3 rounded-lg bg-background/60 border border-border/40 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Zap size={12} className="text-primary" />
              <span className="font-medium text-foreground/80">Agent wants to:</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {approval.actionPreview.tool}
              </Badge>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-14">Target:</span>
                <span className="font-medium">{approval.actionPreview.target}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-14">Action:</span>
                <span className="font-medium">{approval.actionPreview.action}</span>
              </div>
              {approval.actionPreview.parameters.message && (
                <div className="mt-2 p-2 rounded bg-muted/30 border border-border/30 text-[12px] leading-relaxed">
                  <span className="text-muted-foreground font-medium">Message: </span>
                  {approval.actionPreview.parameters.message}
                </div>
              )}
            </div>
          </div>

          {/* Expanded Details */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-11 space-y-3 mb-3 overflow-hidden"
              >
                {/* Agent Reasoning */}
                <div className="rounded-lg bg-primary/5 border border-primary/15 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary mb-1">
                    <span className="flex h-4 w-4 rounded-full bg-primary items-center justify-center shrink-0">
                      <span className="text-primary-foreground text-[8px]">AI</span>
                    </span>
                    Agent Reasoning
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {approval.agentReasoning}
                  </p>
                </div>

                {/* Risk Reasoning */}
                <div className={`rounded-lg ${risk.bg} border ${risk.border} p-3`}>
                  <div className={`flex items-center gap-2 text-xs font-medium ${risk.color} mb-1`}>
                    <RiskIcon size={12} />
                    Why {risk.label}?
                  </div>
                  <p className="text-xs text-foreground/70 leading-relaxed">
                    {approval.riskReasoning}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="ml-11">
            <Separator className="mb-3 bg-border/30" />

            {rejectMode ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                <Textarea
                  placeholder="Why are you rejecting this action? (required)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="text-xs min-h-[60px] bg-background"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setRejectMode(false);
                      setRejectReason("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs"
                    disabled={!rejectReason.trim()}
                    onClick={() => {
                      onReject(approval.id, rejectReason);
                      setDecided("rejected");
                    }}
                  >
                    <XCircle size={14} className="mr-1" />
                    Confirm Rejection
                  </Button>
                </div>
              </motion.div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="text-xs font-medium"
                  onClick={() => {
                    onApprove(approval.id, approveNote || undefined);
                    setDecided("approved");
                  }}
                >
                  <CheckCircle2 size={14} className="mr-1.5" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-red-400 border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => setRejectMode(true)}
                >
                  <XCircle size={14} className="mr-1.5" />
                  Reject
                </Button>
                <div className="flex-1" />
                <span className="text-[10px] text-muted-foreground/50 font-mono">
                  {approval.id}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ── Helpers ──

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getTimeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "in < 1h";
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

// ── Page Component ──

export default function ApprovalsPage() {
  const { isLoading: authLoading } = useAuth();
  const [filter, setFilter] = useState<string>("pending");
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authLoading) return;
    async function fetchApprovals() {
      setLoading(true);
      try {
        const res = await api.getDashboardApprovals();
        setApprovals(res.data || []);
      } catch (err) {
        console.error("Failed to fetch approvals", err);
      } finally {
        setLoading(false);
      }
    }
    fetchApprovals();
  }, [authLoading]);

  const filteredApprovals =
    filter === "all"
      ? approvals
      : approvals.filter((a) => a.status === filter);

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  const handleApprove = (id: string, note?: string) => {
    console.log(`Approved: ${id}`, note);
    setApprovals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "approved" as const } : a))
    );
  };

  const handleReject = (id: string, reason: string) => {
    console.log(`Rejected: ${id}`, reason);
    setApprovals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "rejected" as const } : a))
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 px-8 py-8 md:flex-row md:items-end md:justify-between pb-6 border-b border-border/40">
        <div className="space-y-1 relative">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck size={14} />
            </div>
            {pendingCount > 0 && (
              <span className="flex items-center justify-center rounded-full bg-red-500 px-2 min-w-[20px] h-5 text-[10px] font-bold text-white tracking-widest leading-none shadow-sm shadow-red-500/20">
                {pendingCount}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Approval Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[600px]">
            Review and approve agent actions before they execute.
            {pendingCount > 0 &&
              ` ${pendingCount} action${pendingCount > 1 ? "s" : ""} awaiting your decision.`}
          </p>
        </div>
        
        {/* Filters */}
        <div className="flex gap-1.5 p-1 bg-muted/40 rounded-lg border border-border/50">
          {["pending", "approved", "rejected", "all"].map((f) => (
            <Button
              key={f}
              variant={filter === f ? "secondary" : "ghost"}
              size="sm"
              className={`text-xs capitalize h-8 px-3 ${filter === f ? "bg-background shadow-sm" : "hover:bg-background/50"}`}
              onClick={() => setFilter(f)}
            >
              {f === "pending" ? `Pending (${pendingCount})` : f}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8 relative">
        <div className="max-w-4xl mx-auto h-full flex flex-col">
          {loading ? (
            <div className="flex flex-col justify-center items-center h-full min-h-[300px] space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">Loading approvals...</p>
            </div>
          ) : approvals.length === 0 ? (
            <div className="flex-1 flex items-center justify-center mt-[-40px]">
              <EmptyState
                icon={Inbox}
                title="All caught up"
                description="There are currently no agent actions waiting for your approval. When Sprint Guardian proposes a high-risk action (like sending a Slack broadcast), it will appear here."
              />
            </div>
          ) : filteredApprovals.length === 0 ? (
            <div className="flex-1 flex items-center justify-center mt-[-40px]">
              <div className="text-center py-16 px-6 rounded-xl border border-dashed border-border/60 bg-card/20 min-h-[250px] w-full max-w-xl flex flex-col items-center justify-center">
                <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-foreground/80">No {filter} approvals</h3>
                <p className="text-sm text-muted-foreground/80 mt-2 max-w-[300px]">
                  You have no {filter} requests right now. Try changing your filter to see other requests.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-12">
              <AnimatePresence initial={false} mode="popLayout">
                {filteredApprovals.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    approval={approval}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
