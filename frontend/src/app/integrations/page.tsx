"use client";

import { useState } from "react";
import {
  Webhook,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  Shield,
  RefreshCw,
  ArrowRight,
  Lock,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";

// ── Types ──

interface Integration {
  id: string;
  name: string;
  provider: "jira" | "github" | "slack";
  description: string;
  status: "connected" | "disconnected" | "error";
  connectedAs?: string;
  scopes: string[];
  lastSync?: string;
  icon: string;
  color: string;
  bgGradient: string;
}

// ── Sample Data ──

const INTEGRATIONS: Integration[] = [
  {
    id: "int-jira",
    name: "Jira (Atlassian)",
    provider: "jira",
    description:
      "Query sprint tickets, identify stale issues, and track assignment patterns across your Jira projects.",
    status: "connected",
    connectedAs: "alex@acme.atlassian.net",
    scopes: ["read:jira-work", "read:jira-user", "read:sprint:jira-software"],
    lastSync: "2026-03-22T10:15:00Z",
    icon: "🔷",
    color: "text-blue-400",
    bgGradient: "from-blue-500/10 via-blue-500/5 to-transparent",
  },
  {
    id: "int-github",
    name: "GitHub",
    provider: "github",
    description:
      "Monitor pull requests, CI/CD pipeline status, review bottlenecks, and merge readiness across repositories.",
    status: "connected",
    connectedAs: "acme-corp (Organization)",
    scopes: ["repo:status", "read:org", "read:user", "read:discussion"],
    lastSync: "2026-03-22T10:20:00Z",
    icon: "🐙",
    color: "text-zinc-300",
    bgGradient: "from-zinc-500/10 via-zinc-500/5 to-transparent",
  },
  {
    id: "int-slack",
    name: "Slack",
    provider: "slack",
    description:
      "Send sprint health notifications, DM developers about stale work, and post summaries to channels.",
    status: "disconnected",
    scopes: ["chat:write", "users:read", "users:read.email", "channels:read"],
    icon: "💬",
    color: "text-green-400",
    bgGradient: "from-green-500/10 via-green-500/5 to-transparent",
  },
];

// ── Integration Card ──

function IntegrationCard({ integration }: { integration: Integration }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const statusConfig = {
    connected: {
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      label: "Connected",
    },
    disconnected: {
      icon: XCircle,
      color: "text-zinc-400",
      bg: "bg-zinc-500/10",
      label: "Not Connected",
    },
    error: {
      icon: AlertCircle,
      color: "text-red-400",
      bg: "bg-red-500/10",
      label: "Error",
    },
  };

  const status = statusConfig[integration.status];
  const StatusIcon = status.icon;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsRefreshing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="relative overflow-hidden border-border/50 bg-card/50">
        {/* Gradient accent */}
        <div className={`absolute inset-0 bg-gradient-to-r ${integration.bgGradient} pointer-events-none`} />

        <div className="relative p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="text-3xl">{integration.icon}</div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold">{integration.name}</h3>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 uppercase border-transparent ${status.bg} ${status.color}`}
                  >
                    <StatusIcon size={10} className="mr-1" />
                    {status.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {integration.description}
                </p>
              </div>
            </div>
          </div>

          {/* Connection Details */}
          {integration.status === "connected" && (
            <div className="bg-background/60 rounded-lg border border-border/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <Lock size={12} className="text-emerald-400" />
                  <span className="text-muted-foreground">Connected via</span>
                  <span className="font-medium text-foreground">Auth0 Token Vault</span>
                </div>
                {integration.lastSync && (
                  <span className="text-[10px] text-muted-foreground">
                    Last sync:{" "}
                    {new Date(integration.lastSync).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>

              {integration.connectedAs && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Account:</span>
                  <span className="font-mono text-foreground/80 bg-muted px-1.5 py-0.5 rounded">
                    {integration.connectedAs}
                  </span>
                </div>
              )}

              {/* Scopes */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">
                  Granted Scopes
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {integration.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/30 text-muted-foreground"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              {/* Token Vault Security Notice */}
              <div className="flex items-start gap-2 text-[11px] text-emerald-400/80 bg-emerald-500/5 rounded border border-emerald-500/10 p-2">
                <Shield size={12} className="shrink-0 mt-0.5" />
                <span>
                  Tokens are dynamically retrieved from Auth0 Token Vault at runtime.
                  No credentials are stored in the application.
                </span>
              </div>
            </div>
          )}

          {/* Disconnected State */}
          {integration.status === "disconnected" && (
            <div className="bg-background/60 rounded-lg border border-border/30 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium mb-1">Connection Required</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    This integration requires you to connect your account through Auth0.
                    Sprint Guardian will use delegated access tokens — no passwords are ever stored.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {integration.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/30 text-muted-foreground"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {integration.status === "connected" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    size={12}
                    className={`mr-1.5 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                  {isRefreshing ? "Syncing..." : "Re-sync"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                >
                  <ExternalLink size={12} className="mr-1.5" />
                  Manage in Auth0
                </Button>
              </>
            ) : (
              <Button size="sm" className="text-xs font-medium">
                <Zap size={12} className="mr-1.5" />
                Connect {integration.name}
                <ArrowRight size={12} className="ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ── Page Component ──

export default function IntegrationsPage() {
  const connectedCount = INTEGRATIONS.filter(
    (i) => i.status === "connected"
  ).length;

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Webhook className="h-6 w-6 text-purple-400" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Integrations
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {connectedCount} of {INTEGRATIONS.length} integrations connected.
            Sprint Guardian uses Auth0 Token Vault for secure, delegated API access.
          </p>
        </div>

        {/* Security Banner */}
        <Card className="p-4 bg-primary/5 border-primary/15">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-primary mb-1">
                Enterprise Security with Auth0 Token Vault
              </h3>
              <p className="text-xs text-foreground/70 leading-relaxed">
                Sprint Guardian never stores API keys, passwords, or long-lived tokens.
                All third-party access uses short-lived, delegated tokens retrieved from
                Auth0 Token Vault at runtime. Your credentials stay safe in Auth0.
              </p>
            </div>
          </div>
        </Card>

        {/* Integration Cards */}
        <div className="space-y-4 pb-8">
          {INTEGRATIONS.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      </div>
    </div>
  );
}
