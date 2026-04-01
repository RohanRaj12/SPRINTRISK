"use client";

import { useEventStream, type Toast } from "@/lib/use-events";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const ICON_MAP: Record<Toast["type"], any> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
  success: CheckCircle2,
};

const COLOR_MAP: Record<Toast["type"], string> = {
  info: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

export function ToastOverlay() {
  const { toasts, dismissToast } = useEventStream();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] space-y-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = ICON_MAP[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-lg backdrop-blur-sm text-sm animate-in slide-in-from-right-5 ${COLOR_MAP[toast.type]}`}
          >
            <Icon size={15} className="mt-0.5 shrink-0" />
            <span className="flex-1 text-xs leading-relaxed">{toast.message}</span>
            <button onClick={() => dismissToast(toast.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
