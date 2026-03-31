"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Webhook,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  Shield,
  RefreshCw,
  Lock,
  Zap,
  Copy,
  ChevronDown,
  ChevronUp,
  Activity,
  Clock,
  Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ── Types ──

interface IntegrationStatus {
  provider: "auth0" | "github" | "slack" | "jira";
  displayName: string;
  description: string;
  status: "connected" | "disconnected" | "checking" | "error";
  account?: string;
  avatarUrl?: string;
  scopes?: string[];
  lastChecked?: string;
  lastConnected?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  connectInstructions?: string[];
}

interface LiveStatusResponse {
  integrations: IntegrationStatus[];
  connectedCount: number;
  totalCount: number;
  timestamp: string;
}

const PROVIDER_UI: Record<
  string,
  { icon: string; color: string; bgGradient: string; brandColor: string }
> = {
  auth0: {
    icon: "\uD83D\uDD10",
    color: "text-orange-400",
    bgGradient: "from-orange-500/10 via-orange-500/5 to-transparent",
    brandColor: "#EB5424",
  },
  github: {
    icon: "\uD83D\uDC19",
    color: "text-zinc-300",
    bgGradient: "from-zinc-500/10 via-zinc-500/5 to-transparent",
    brandColor: "#24292f",
  },
  slack: {
    icon: "\uD83D\uDCAC",
    color: "text-green-400",
    bgGradient: "from-green-500/10 via-green-500/5 to-transparent",
    brandColor: "#4A154B",
  },
  jira: {
    icon: "\uD83D\uDD37",
    color: "text-blue-400",
    bgGradient: "from-blue-500/10 via-blue-500/5 to-transparent",
    brandColor: "#0052CC",
  },
};

const STATUS_CONFIG = {
  connected: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    label: "Connected",
    pulse: true,
  },
  disconnected: {
    icon: XCircle,
    color: "text-zinc-500",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
    label: "Not Connected",
    pulse: false,
  },
  checking: {
    icon: RefreshCw,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "Checking...",
    pulse: true,
  },
  error: {
    icon: AlertCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    label: "Error",
    pulse: false,
  },
};

// ── Integration Card ──

function IntegrationCard({
  integration,
  onRefresh,
}: {
  integration: IntegrationStatus;
  onRefresh: () => void;
}) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const ui = PROVIDER_UI[integration.provider] ?? PROVIDER_UI.github;
  const status = STATUS_CONFIG[integration.status];
  const StatusIcon = status.icon;

  const copyWebhookUrl = (path: string) => {
    navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const webhookPaths: Record<string, string> = {
    github: "/api/webhooks/github",
    jira: "/api/webhooks/jira",
    slack: "/api/webhooks/slack",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="relative overflow-hidden border-border/50 bg-card/50">
        <div
          className={`absolute inset-0 bg-gradient-to-r ${ui.bgGradient} pointer-events-none`}
        />

        <div className="relative p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="text-3xl">{ui.icon}</div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold">
                    {integration.displayName}
                  </h3>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 uppercase border-transparent ${status.bg} ${status.color}`}
                  >
                    <StatusIcon
                      size={10}
                      className={`mr-1 ${status.pulse && integration.status === "connected" ? "animate-pulse" : ""}`}
                    />
                    {status.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {integration.description}
                </p>
              </div>
            </div>

            {/* Live indicator */}
            {integration.status === "connected" && (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE
              </div>
            )}
          </div>

          {/* Connected Details */}
          {integration.status === "connected" && (
            <div className="bg-background/60 rounded-lg border border-border/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <Lock size={12} className="text-emerald-400" />
                  <span className="text-muted-foreground">Authenticated as</span>
                  <span className="font-medium text-foreground">
                    {integration.account ?? "connected"}
                  </span>
                </div>
                {integration.lastChecked && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock size={10} />
                    Last verified:{" "}
                    {new Date(integration.lastChecked).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>
                )}
              </div>

              {/* Account details from metadata */}
              {integration.metadata && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(integration.metadata)
                    .filter(
                      ([k, v]) =>
                        v !== undefined &&
                        v !== null &&
                        typeof v !== "object" &&
                        !k.includes("Secret") &&
                        !k.includes("token")
                    )
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className="text-muted-foreground capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}:
                        </span>
                        <span className="font-mono text-foreground/80 bg-muted px-1.5 py-0.5 rounded text-[10px] truncate max-w-[200px]">
                          {String(value)}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {/* Scopes */}
              {integration.scopes && integration.scopes.length > 0 && (
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
              )}

              {/* Webhook URL */}
              {webhookPaths[integration.provider] && (
                <div className="flex items-center gap-2 text-[11px] text-blue-400/80 bg-blue-500/5 rounded border border-blue-500/10 p-2">
                  <Globe size={12} className="shrink-0" />
                  <span className="font-mono text-[10px] flex-1 truncate">
                    Webhook: {API}
                    {webhookPaths[integration.provider]}
                  </span>
                  <button
                    onClick={() =>
                      copyWebhookUrl(webhookPaths[integration.provider])
                    }
                    className="shrink-0 hover:text-blue-300 transition-colors"
                  >
                    <Copy size={12} />
                  </button>
                  {copied && (
                    <span className="text-emerald-400 text-[10px]">Copied!</span>
                  )}
                </div>
              )}

              {/* Token Vault Security */}
              <div className="flex items-start gap-2 text-[11px] text-emerald-400/80 bg-emerald-500/5 rounded border border-emerald-500/10 p-2">
                <Shield size={12} className="shrink-0 mt-0.5" />
                <span>
                  {integration.provider === "auth0"
                    ? "Auth0 by Okta provides the identity layer. JWT tokens, M2M credentials, and Token Vault are all managed here."
                    : "Connection verified via direct API token. In production, tokens flow through Auth0 Token Vault — no credentials stored in the app."}
                </span>
              </div>
            </div>
          )}

          {/* Error State */}
          {integration.status === "error" && (
            <div className="bg-red-500/5 rounded-lg border border-red-500/20 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-400 mb-1">
                    Connection Error
                  </p>
                  <p className="text-xs text-red-400/70 font-mono">
                    {integration.error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Disconnected State */}
          {integration.status === "disconnected" && (
            <div className="bg-background/60 rounded-lg border border-border/30 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={16}
                  className="text-amber-400 shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium mb-1">Setup Required</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Configure the required environment variables to connect.
                    Sprint Guardian uses delegated access tokens — no passwords
                    are stored.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Setup Instructions (expandable) */}
          {integration.connectInstructions &&
            integration.connectInstructions.length > 0 && (
              <div>
                <button
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  {showInstructions ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  {showInstructions ? "Hide" : "Show"} Setup Instructions
                </button>

                <AnimatePresence>
                  {showInstructions && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 bg-muted/30 rounded-lg border border-border/30 p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          How to Connect
                        </h4>
                        <ol className="space-y-1.5">
                          {integration.connectInstructions.map((step, i) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground leading-relaxed font-mono"
                            >
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={onRefresh}
            >
              <RefreshCw size={12} className="mr-1.5" />
              Re-check
            </Button>
            {integration.provider === "auth0" && (
              <a
                href={`https://${integration.metadata?.domain ?? "manage.auth0.com"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center h-8 px-3 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <ExternalLink size={12} className="mr-1.5" />
                Open Auth0 Dashboard
              </a>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ── Page Component ──

export default function IntegrationsPage() {
  const [data, setData] = useState<LiveStatusResponse | null>(null);
  const [instructions, setInstructions] = useState<
    Record<string, string[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, instructionsRes] = await Promise.all([
        fetch(`${API}/api/integrations/live-status`),
        fetch(`${API}/api/integrations/connect-instructions`),
      ]);

      if (statusRes.ok) {
        const json = (await statusRes.json()) as LiveStatusResponse;
        setData(json);
      }

      if (instructionsRes.ok) {
        const json = await instructionsRes.json();
        const map: Record<string, string[]> = {};
        for (const i of json.integrations) {
          map[i.provider] = i.connectInstructions ?? [];
        }
        setInstructions(map);
      }
    } catch (err) {
      console.error("Failed to fetch integration status", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll every 15s for real-time updates
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const integrations = (data?.integrations ?? []).map((i) => ({
    ...i,
    connectInstructions: instructions[i.provider] ?? i.connectInstructions ?? [],
  }));

  const connectedCount = data?.connectedCount ?? 0;
  const totalCount = data?.totalCount ?? 0;

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
            <div className="flex items-center gap-1.5 ml-auto">
              {!loading && (
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    connectedCount === totalCount
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                  }`}
                >
                  <Activity size={12} className="mr-1" />
                  {connectedCount}/{totalCount} Connected
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-xs"
              >
                <RefreshCw
                  size={12}
                  className={`mr-1 ${refreshing ? "animate-spin" : ""}`}
                />
                {refreshing ? "Checking..." : "Refresh All"}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Real-time connection status for all services. Auth0 by Okta provides
            the identity and security layer.
          </p>
        </div>

        {/* Architecture Banner */}
        <Card className="p-4 bg-primary/5 border-primary/15">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-primary mb-1">
                Auth0 by Okta — Core Security Layer
              </h3>
              <p className="text-xs text-foreground/70 leading-relaxed">
                Auth0 provides JWT authentication, PKCE OAuth flows, M2M
                credentials, and Token Vault for delegated API access. All
                third-party tokens are managed securely by Auth0 — Sprint
                Guardian never stores long-lived credentials.
              </p>
            </div>
          </div>
        </Card>

        {/* Integration Cards */}
        <div className="space-y-4 pb-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-xs text-muted-foreground">
                Testing connections...
              </p>
            </div>
          ) : (
            integrations.map((integration) => (
              <IntegrationCard
                key={integration.provider}
                integration={integration}
                onRefresh={handleRefresh}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
