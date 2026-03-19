"use client";

import { Settings, Bell, Shield, Palette, Webhook } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Settings className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure Sprint Guardian connections and preferences.
          </p>
        </div>

        <Card className="p-6 space-y-6 bg-card/50">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-medium">Auth0 Configuration</h3>
              <p className="text-xs text-muted-foreground">Manage your Auth0 tenant and Token Vault connections.</p>
            </div>
          </div>
          <Separator className="bg-border/50" />
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Auth0 Domain</label>
              <Input placeholder="your-tenant.us.auth0.com" className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">API Audience</label>
              <Input placeholder="https://api.sprint-guardian.com" className="bg-background" />
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-6 bg-card/50">
          <div className="flex items-center gap-3">
            <Webhook className="h-5 w-5 text-purple-400" />
            <div>
              <h3 className="text-sm font-medium">Integrations</h3>
              <p className="text-xs text-muted-foreground">Jira, GitHub, and Slack connection status.</p>
            </div>
          </div>
          <Separator className="bg-border/50" />
          <div className="space-y-3">
            {[
              { name: "Jira (Atlassian)", status: "Connected", color: "text-emerald-500" },
              { name: "GitHub", status: "Connected", color: "text-emerald-500" },
              { name: "Slack", status: "Pending Setup", color: "text-amber-500" },
            ].map((integration) => (
              <div key={integration.name} className="flex items-center justify-between py-2">
                <span className="text-sm">{integration.name}</span>
                <span className={`text-xs font-medium ${integration.color}`}>{integration.status}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 space-y-6 bg-card/50">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-medium">Notifications</h3>
              <p className="text-xs text-muted-foreground">Configure when Sprint Guardian sends alerts.</p>
            </div>
          </div>
          <Separator className="bg-border/50" />
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Slack Channel</label>
              <Input placeholder="#engineering" defaultValue="#engineering" className="bg-background" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Cron Schedule</label>
              <Input placeholder="0 9 * * 1-5" defaultValue="0 9 * * 1-5" className="bg-background" />
              <p className="text-[11px] text-muted-foreground">Weekdays at 9:00 AM</p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end pb-8">
          <Button>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}
