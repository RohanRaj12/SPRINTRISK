"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ListTodo,
  Activity,
  Settings,
  ShieldCheck,
  Webhook,
  LogIn,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/integrations", icon: Webhook, label: "Integrations" },
  { href: "/issues", icon: ListTodo, label: "Issues & PRs" },
  { href: "/approvals", icon: ShieldCheck, label: "Approvals" },
  { href: "/audit-log", icon: Activity, label: "Audit Log" },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading, user, login, logout } = useAuth();

  return (
    <aside className={cn("w-56 border-r border-border/50 bg-background flex flex-col h-full shrink-0", className)}>
      {/* Logo */}
      <Link href="/" className="flex h-14 items-center border-b border-border/50 px-4 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2.5 font-semibold text-sm">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
            <Activity className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="tracking-tight">Sprint Guardian</span>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
              pathname === item.href
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border/50 space-y-1">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
            pathname === "/settings"
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <Settings size={16} />
          <span>Settings</span>
        </Link>

        {authLoading ? (
          <div className="flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            <span>Loading...</span>
          </div>
        ) : isAuthenticated && user ? (
          <div className="flex items-center gap-2 px-3 py-2">
            {user.picture ? (
              <img src={user.picture} alt="" className="h-6 w-6 rounded-full" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                {(user.name ?? user.email ?? "U")[0].toUpperCase()}
              </div>
            )}
            <span className="flex-1 text-xs truncate">{user.name ?? user.email}</span>
            <button
              onClick={logout}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-primary hover:bg-primary/10 transition-colors w-full"
          >
            <LogIn size={16} />
            <span>Sign in</span>
          </button>
        )}
      </div>
    </aside>
  );
}
