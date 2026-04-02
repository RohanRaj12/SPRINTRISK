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
  Zap,
  Activity,
  Link2,
  Settings,
  Bell,
  Save,
  CheckSquare,
  GitPullRequest,
  MessageSquare,
  LogIn,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

// ── Types ──

interface OrgConfig {
  jira: { site: string; projectKey: string; boardName: string; staleThresholdDays: number };
  github: { owner: string; repo: string; branch: string };
  slack: { channel: string; alertSeverity: string; enabled: boolean };
  notifications: { staleTickets: boolean; ciFailures: boolean; prReminders: boolean; escalations: boolean };
}

const EMPTY_CONFIG: OrgConfig = {
  jira: { site: "", projectKey: "", boardName: "", staleThresholdDays: 3 },
  github: { owner: "", repo: "", branch: "main" },
  slack: { channel: "#engineering", alertSeverity: "medium", enabled: true },
  notifications: { staleTickets: true, ciFailures: true, prReminders: true, escalations: true },
};

// ── Static platform definitions (always visible, no API dependency) ──

interface Platform {
  id: "github" | "jira" | "slack";
  name: string;
  description: string;
  icon: string;
  color: string;
  bgGradient: string;
  connectionName: string; // Auth0 social connection name
}

const PLATFORMS: Platform[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Monitor PRs, CI/CD status, commits, issues, and review bottlenecks.",
    icon: "🐙",
    color: "text-zinc-400",
    bgGradient: "from-zinc-500/10 via-zinc-500/5 to-transparent",
    connectionName: "github",
  },
  {
    id: "jira",
    name: "Jira (Atlassian)",
    description: "Track sprint issues, blockers, SLA violations, and status transitions.",
    icon: "🔷",
    color: "text-blue-400",
    bgGradient: "from-blue-500/10 via-blue-500/5 to-transparent",
    connectionName: "Atlassian",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send sprint alerts, DM developers, and monitor team communication.",
    icon: "💬",
    color: "text-green-400",
    bgGradient: "from-green-500/10 via-green-500/5 to-transparent",
    connectionName: "sign-in-with-slack",
  },
];

// ── Page Component ──

export default function IntegrationsPage() {
  const { isAuthenticated, user, login, linkAccount } = useAuth();

  // Live status from backend (optional — page works without it)
  const [liveStatuses, setLiveStatuses] = useState<Record<string, string>>({});
  const [backendReachable, setBackendReachable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [justConnected, setJustConnected] = useState(false);

  // Settings
  const [config, setConfig] = useState<OrgConfig>(EMPTY_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Try to fetch live status from backend (non-blocking — page renders regardless)
  const fetchStatus = useCallback(async () => {
    let map: Record<string, string> = {};

    // Read locally persisted connection status (survives session changes)
    try {
      const stored = JSON.parse(localStorage.getItem("sg_connected_services") || "{}");
      for (const [provider, info] of Object.entries(stored)) {
        if ((info as any)?.linked) {
          map[provider] = "connected";
        }
      }
    } catch {
      // Ignore parse errors
    }
    
    try {
      const res = await api.getLiveStatus();
      if (res?.integrations) {
        for (const i of res.integrations) {
          // Only override if backend says connected (don't override local "connected" with backend "disconnected")
          if (i.status === "connected") {
            map[i.provider] = i.status;
          }
        }
        setBackendReachable(true);
      }
    } catch {
      setBackendReachable(false);
    }

    try {
      if (isAuthenticated) {
        const userRes = await api.getUserIntegrationStatus();
        if (userRes?.services) {
          userRes.services.forEach(s => {
            if (s.linked) {
              map[s.provider] = "connected";
            }
          });
        }
      }
    } catch {
      // Ignore user auth errors
    }

    setLiveStatuses(map);

    try {
      const configRes = await api.getConfig();
      if (configRes?.config) setConfig(configRes.config);
    } catch {
      // Ignore
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // After OAuth callback (Slack/GitHub/Jira), re-fetch status once auth settles
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hadCode = params.has("code");
    const hadError = params.has("error");
    if (hadCode && !hadError) {
      setJustConnected(true);
      // Re-fetch after auth-context has exchanged the code (~1.5s)
      const t = setTimeout(() => {
        fetchStatus();
        setTimeout(() => setJustConnected(false), 5000);
      }, 1500);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const handleConnect = (platform: Platform) => {
    // Store the platform ID so handleCallback writes the correct localStorage key
    sessionStorage.setItem("linking_provider_id", platform.id);
    linkAccount(platform.connectionName);
  };

  const handleSave = async () => {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      await api.saveConfig(config);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save config", err);
    } finally {
      setSavingConfig(false);
    }
  };

  const getStatusForPlatform = (id: string) => {
    if (!backendReachable) return "unknown";
    return liveStatuses[id] ?? "disconnected";
  };

  const statusDisplay = (status: string) => {
    switch (status) {
      case "connected":
        return { label: "Connected", Icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" };
      case "error":
        return { label: "Error", Icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10" };
      case "unknown":
        return { label: "Not Checked", Icon: Activity, color: "text-zinc-500", bg: "bg-zinc-500/10" };
      default:
        return { label: "Not Connected", Icon: XCircle, color: "text-zinc-500", bg: "bg-zinc-500/10" };
    }
  };

  const connectedCount = PLATFORMS.filter((p) => getStatusForPlatform(p.id) === "connected").length;

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Webhook className="h-6 w-6 text-purple-400" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Integrations & Settings
            </h1>
            <div className="flex items-center gap-1.5 ml-auto">
              <Badge
                variant="outline"
                className={`text-xs ${
                  connectedCount === 3
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                }`}
              >
                <Activity size={12} className="mr-1" />
                {connectedCount}/3 Connected
              </Badge>
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
            Connect your accounts via Auth0 — no passwords or API tokens stored in this app.
          </p>
        </div>

        {/* Just Connected Banner */}
        {justConnected && (
          <Card className="p-4 bg-emerald-500/10 border-emerald-500/30">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-emerald-400">Account linked successfully!</h3>
                <p className="text-xs text-foreground/60">Your integration has been connected via Auth0 Token Vault. The status below will update momentarily.</p>
              </div>
            </div>
          </Card>
        )}

        {/* Auth Status Banner */}
        {!isAuthenticated ? (
          <Card className="p-4 bg-amber-500/5 border-amber-500/20">
            <div className="flex items-center gap-3">
              <LogIn className="h-5 w-5 text-amber-400 shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-amber-400 mb-0.5">
                  Sign in to connect your accounts
                </h3>
                <p className="text-xs text-foreground/60 leading-relaxed">
                  Click any platform below to sign in via Auth0 and connect it in one step.
                  Or sign in first using the button on the right.
                </p>
              </div>
              <Button size="sm" onClick={login} className="shrink-0 bg-amber-500 hover:bg-amber-600 text-black font-medium">
                <LogIn size={14} className="mr-1.5" />
                Sign In
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-emerald-400 shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-emerald-400 mb-0.5">
                  Signed in as {user?.name ?? user?.email}
                </h3>
                <p className="text-xs text-foreground/60 leading-relaxed">
                  Auth0 Token Vault is active. Connect platforms below to grant Sprint Guardian secure, token-vault-backed access.
                  <strong> No API keys or PATs are stored in this application.</strong>
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* ── Platform Cards (ALWAYS VISIBLE) ── */}
        <div className="space-y-4">
          {PLATFORMS.map((platform, index) => {
            const status = getStatusForPlatform(platform.id);
            const sd = statusDisplay(status);
            const isConnected = status === "connected";

            return (
              <motion.div
                key={platform.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Card className="relative overflow-hidden border-border/50 bg-card/50">
                  <div
                    className={`absolute inset-0 bg-gradient-to-r ${platform.bgGradient} pointer-events-none`}
                  />

                  <div className="relative p-6">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: icon + info */}
                      <div className="flex items-start gap-4 flex-1">
                        <div className="text-3xl">{platform.icon}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-semibold">{platform.name}</h3>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-2 py-0.5 uppercase border-transparent ${sd.bg} ${sd.color}`}
                            >
                              <sd.Icon size={10} className="mr-1" />
                              {sd.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                            {platform.description}
                          </p>

                          {/* Connect Button — ALWAYS SHOWN when not connected */}
                          {!isConnected && (
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                              onClick={() => handleConnect(platform)}
                            >
                              <Link2 size={14} className="mr-1.5" />
                              Connect {platform.name}
                            </Button>
                          )}

                          {/* Connected state */}
                          {isConnected && (
                            <div className="flex items-center gap-2 text-xs text-emerald-400">
                              <CheckCircle2 size={14} />
                              <span>Securely connected via Auth0 Token Vault</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: live indicator */}
                      {isConnected && (
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          LIVE
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Auth0 Info */}
        <Card className="p-4 bg-primary/5 border-primary/15">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-primary mb-1">
                How It Works — Zero-PAT Security
              </h3>
              <p className="text-xs text-foreground/70 leading-relaxed">
                When you click &ldquo;Connect&rdquo;, you&apos;re redirected to Auth0 to authorize via OAuth.
                Auth0 securely stores your GitHub/Jira/Slack tokens in its Token Vault.
                The Sprint Guardian agent retrieves short-lived delegated tokens at runtime.
                <strong> No API keys, passwords, or PATs are ever stored in this application.</strong>
              </p>
            </div>
          </div>
        </Card>

        {/* ── SETTINGS / CONFIGURATION ── */}
        <div className="pt-8 border-t border-border/40 space-y-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Settings size={20} className="text-muted-foreground" />
              Settings
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Service configuration and notifications.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Jira Config */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare size={16} className="text-blue-400" />
                <h3 className="text-sm font-semibold">Jira Configuration</h3>
              </div>
              <div className="space-y-3">
                <Field label="Jira Site URL" placeholder="company.atlassian.net" value={config.jira.site}
                  onChange={(v) => setConfig({ ...config, jira: { ...config.jira, site: v } })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Project Key" placeholder="ENG" value={config.jira.projectKey}
                    onChange={(v) => setConfig({ ...config, jira: { ...config.jira, projectKey: v } })} />
                  <Field label="Stale (days)" placeholder="3" value={String(config.jira.staleThresholdDays)}
                    onChange={(v) => setConfig({ ...config, jira: { ...config.jira, staleThresholdDays: parseInt(v) || 3 } })} />
                </div>
              </div>
            </Card>

            {/* GitHub Config */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <GitPullRequest size={16} className="text-zinc-400" />
                <h3 className="text-sm font-semibold">GitHub Configuration</h3>
              </div>
              <div className="space-y-3">
                <Field label="Owner / Org" placeholder="acme-corp" value={config.github.owner}
                  onChange={(v) => setConfig({ ...config, github: { ...config.github, owner: v } })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Repository" placeholder="main-app" value={config.github.repo}
                    onChange={(v) => setConfig({ ...config, github: { ...config.github, repo: v } })} />
                  <Field label="Branch" placeholder="main" value={config.github.branch}
                    onChange={(v) => setConfig({ ...config, github: { ...config.github, branch: v } })} />
                </div>
              </div>
            </Card>

            {/* Slack Config */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={16} className="text-green-400" />
                <h3 className="text-sm font-semibold">Slack Configuration</h3>
              </div>
              <div className="space-y-3">
                <Field label="Channel" placeholder="#engineering" value={config.slack.channel}
                  onChange={(v) => setConfig({ ...config, slack: { ...config.slack, channel: v } })} />
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Alert Severity</label>
                  <select
                    value={config.slack.alertSeverity}
                    onChange={(e) => setConfig({ ...config, slack: { ...config.slack, alertSeverity: e.target.value } })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="low">Low (all alerts)</option>
                    <option value="medium">Medium+</option>
                    <option value="high">High+ only</option>
                    <option value="critical">Critical only</option>
                  </select>
                </div>
              </div>
            </Card>

            {/* Notifications */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bell size={16} className="text-amber-400" />
                <h3 className="text-sm font-semibold">Notification Preferences</h3>
              </div>
              <div className="space-y-2.5">
                {([
                  { key: "staleTickets", label: "Stale ticket alerts" },
                  { key: "ciFailures", label: "CI failure alerts" },
                  { key: "prReminders", label: "PR review reminders" },
                  { key: "escalations", label: "Escalation notifications" },
                ] as const).map((item) => (
                  <label key={item.key} className="flex items-center justify-between py-1 cursor-pointer">
                    <span className="text-sm">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => setConfig({
                        ...config,
                        notifications: { ...config.notifications, [item.key]: !config.notifications[item.key] },
                      })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        config.notifications[item.key] ? "bg-primary" : "bg-secondary"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow transition-transform ${
                        config.notifications[item.key] ? "translate-x-4" : "translate-x-0.5"
                      }`} />
                    </button>
                  </label>
                ))}
              </div>
            </Card>
          </div>

          {/* Save */}
          <div className="flex items-center justify-end gap-3 pb-8">
            {configSaved && <span className="text-xs text-emerald-400">Settings saved!</span>}
            <Button onClick={handleSave} disabled={savingConfig} className="gap-1.5">
              <Save size={14} />
              {savingConfig ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background h-9 text-sm"
      />
    </div>
  );
}
