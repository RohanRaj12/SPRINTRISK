"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CheckSquare,
  GitPullRequest,
  Activity,
  Settings,
  ShieldCheck,
  Webhook,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Sprint Health" },
  { href: "/jira", icon: CheckSquare, label: "Jira Issues" },
  { href: "/github", icon: GitPullRequest, label: "GitHub PRs" },
  { href: "/approvals", icon: ShieldCheck, label: "Approvals", badge: 3 },
  { href: "/audit-log", icon: Activity, label: "Audit Log" },
  { href: "/integrations", icon: Webhook, label: "Integrations" },
];

const SAVED_AUDITS = [
  { label: "Frontend Blockers", dotColor: "bg-red-500", href: "/?filter=blocked" },
  { label: "Core API Health", dotColor: "bg-amber-500", href: "/?filter=stale" },
  { label: "Stale Reviews", dotColor: "bg-blue-500", href: "/?filter=review" },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside className={cn("w-64 border-r border-border/50 bg-background/50 flex flex-col h-full", className)}>
      <Link href="/" className="flex h-14 items-center border-b border-border/50 px-4 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 font-semibold">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
            <Activity className="h-4 w-4 text-primary-foreground" />
          </div>
          <span>Sprint Guardian</span>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <h4 className="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Views
          </h4>
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                  pathname === item.href
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <item.icon size={18} className="text-muted-foreground" />
                <span className="flex-1">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
        
        <div>
          <h4 className="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Saved Audits
          </h4>
          <div className="space-y-1">
            {SAVED_AUDITS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                <span className={cn("h-2 w-2 rounded-full shrink-0", item.dotColor)} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-border/50">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors text-sm cursor-pointer",
            pathname === "/settings"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Settings size={18} />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
