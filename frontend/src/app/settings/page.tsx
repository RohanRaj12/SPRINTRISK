"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Bell,
  Webhook,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  CheckSquare,
  GitPullRequest,
  MessageSquare,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface IntegrationInfo {
  provider: string;
  displayName: string;
  status: "connected" | "disconnected" | "error";
  lastChecked: string;
  error?: string;
}

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

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [config, setConfig] = useState<OrgConfig>(EMPTY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    fetchIntegrations();
    fetchConfig();
  }, []);

  async function fetchIntegrations() {
    try {
      const res = await fetch(`${API}/api/integrations/status`);
      if (res.ok) {
        const json = await res.json();
        setIntegrations(json.integrations || []);
      }
    } catch (err) {
      console.error("Failed to fetch integrations", err);
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetch(`${API}/api/settings/config`);
      if (res.ok) {
        const json = await res.json();
        if (json.config) setConfig(json.config);
      }
    } catch (err) {
      console.error("Failed to fetch config", err);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API}/api/settings/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save config", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleResync(provider: string) {
    setSyncing(provider);
    await fetchIntegrations();
    setTimeout(() => setSyncing(null), 1000);
  }

  const providerIcons: Record<string, any> = {
    jira: CheckSquare,
    github: GitPullRequest,
    slack: MessageSquare,
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6 max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Settings size={20} />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage integrations, service configuration, and notifications.
          </p>
        </div>

        {/* Integration Status (Live) */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Webhook size={16} className="text-purple-400" />
            <h2 className="text-sm font-semibold">Integration Status</h2>
            <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-wider">Live</span>
          </div>
          <div className="space-y-2">
            {(["jira", "github", "slack"] as const).map((provider) => {
              const info = integrations.find((i) => i.provider === provider);
              const Icon = providerIcons[provider] || Webhook;
              const isConnected = info?.status === "connected";
              return (
                <div key={provider} className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5">
                  <Icon size={16} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">{provider === "jira" ? "Jira (Atlassian)" : provider === "github" ? "GitHub" : "Slack"}</span>
                      {isConnected ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <CheckCircle2 size={10} />
                          Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-red-400">
                          <XCircle size={10} />
                          {info?.error ? "Error" : "Disconnected"}
                        </span>
                      )}
                    </div>
                    {info?.error && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{info.error}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => handleResync(provider)}
                    disabled={syncing === provider}
                  >
                    <RefreshCw size={12} className={syncing === provider ? "animate-spin" : ""} />
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Jira Config */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold">Jira Configuration</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jira Site URL" placeholder="company.atlassian.net" value={config.jira.site}
              onChange={(v) => setConfig({ ...config, jira: { ...config.jira, site: v } })} />
            <Field label="Project Key" placeholder="ENG" value={config.jira.projectKey}
              onChange={(v) => setConfig({ ...config, jira: { ...config.jira, projectKey: v } })} />
            <Field label="Board Name" placeholder="Sprint Board" value={config.jira.boardName}
              onChange={(v) => setConfig({ ...config, jira: { ...config.jira, boardName: v } })} />
            <Field label="Stale Threshold (days)" placeholder="3" value={String(config.jira.staleThresholdDays)}
              onChange={(v) => setConfig({ ...config, jira: { ...config.jira, staleThresholdDays: parseInt(v) || 3 } })} />
          </div>
        </Card>

        {/* GitHub Config */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitPullRequest size={16} className="text-zinc-400" />
            <h2 className="text-sm font-semibold">GitHub Configuration</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner / Org" placeholder="acme-corp" value={config.github.owner}
              onChange={(v) => setConfig({ ...config, github: { ...config.github, owner: v } })} />
            <Field label="Repository" placeholder="main-app" value={config.github.repo}
              onChange={(v) => setConfig({ ...config, github: { ...config.github, repo: v } })} />
            <Field label="Branch" placeholder="main" value={config.github.branch}
              onChange={(v) => setConfig({ ...config, github: { ...config.github, branch: v } })} />
          </div>
        </Card>

        {/* Slack Config */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={16} className="text-green-400" />
            <h2 className="text-sm font-semibold">Slack Configuration</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <h2 className="text-sm font-semibold">Notification Preferences</h2>
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

        {/* Save */}
        <div className="flex items-center justify-end gap-3 pb-8">
          {saved && <span className="text-xs text-emerald-400">Settings saved!</span>}
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save size={14} />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
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
