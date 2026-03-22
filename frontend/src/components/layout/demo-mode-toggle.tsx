"use client";

import { motion } from "framer-motion";
import { useDemoMode } from "@/lib/demo-mode-context";
import { Database, Zap } from "lucide-react";

export function DemoModeToggle() {
  const { isDemoMode, setDemoMode, isLoading } = useDemoMode();

  if (isLoading) {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-border/50 animate-pulse">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-5 w-9 bg-muted rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`relative flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
          isDemoMode
            ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50"
            : "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
        }`}
        onClick={() => setDemoMode(!isDemoMode)}
      >
        <div className="flex items-center gap-2">
          {isDemoMode ? (
            <Database size={14} className="text-amber-500" />
          ) : (
            <Zap size={14} className="text-emerald-500" />
          )}
          <span
            className={`text-sm font-medium ${
              isDemoMode ? "text-amber-500" : "text-emerald-500"
            }`}
          >
            {isDemoMode ? "Demo Mode" : "Live Mode"}
          </span>
        </div>

        {/* Custom Toggle Switch */}
        <div
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            isDemoMode ? "bg-amber-500" : "bg-emerald-500"
          }`}
        >
          <motion.span
            layout
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 ${
              isDemoMode ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </div>
      </div>

      {isDemoMode && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-3 py-2 border border-amber-500/20 bg-amber-500/5 rounded-lg text-xs text-amber-500/80 leading-snug"
        >
          Using simulated data sets. Live integrations are bypassed.
        </motion.div>
      )}
    </div>
  );
}
