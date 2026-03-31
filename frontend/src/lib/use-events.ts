"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface Toast {
  id: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  timestamp: number;
}

export function useEventStream() {
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const es = new EventSource(`${API}/api/events/stream`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.addEventListener("audit_finding", (e) => {
      const event: SSEEvent = JSON.parse(e.data);
      setToasts((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          message: (event.data.summary as string) || "New audit finding",
          type: "warning",
          timestamp: Date.now(),
        },
      ]);
    });

    es.addEventListener("audit_complete", (e) => {
      const event: SSEEvent = JSON.parse(e.data);
      setToasts((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          message: (event.data.summary as string) || "Audit completed",
          type: "success",
          timestamp: Date.now(),
        },
      ]);
    });

    es.addEventListener("notification", (e) => {
      const event: SSEEvent = JSON.parse(e.data);
      setToasts((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          message: (event.data.summary as string) || "Notification",
          type: "info",
          timestamp: Date.now(),
        },
      ]);
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  // Auto-dismiss toasts after 8 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.timestamp < 8000));
    }, 1000);
    return () => clearInterval(timer);
  }, [toasts.length]);

  return { connected, toasts, dismissToast };
}
