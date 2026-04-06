/**
 * Sprint Guardian — Frontend API Client
 *
 * Type-safe API client for communicating with the backend.
 * Uses fetch with automatic JWT bearer token injection.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ──

export interface ChatResponse {
  reply: string;
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
  }>;
  meta: {
    rounds: number;
    totalToolCalls: number;
  };
}

export interface ApprovalItem {
  id: string;
  orgId: string;
  stepId: string;
  runId: string;
  title: string;
  description?: string;
  actionPreview: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskReasoning?: string;
  status: "pending" | "approved" | "rejected" | "expired";
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  orgId: string;
  userId?: string;
  runId?: string;
  stepId?: string;
  action: string;
  category: "agent" | "approval" | "integration" | "auth" | "system";
  severity: "info" | "warning" | "error" | "critical";
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface IntegrationStatus {
  provider: string;
  displayName: string;
  status: "connected" | "disconnected" | "error";
  lastChecked: string;
  error?: string;
}

// ── API Client ──

class ApiClient {
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `API Error ${response.status}: ${body}`
      );
    }

    return response.json() as Promise<T>;
  }

  // ── Settings ──

  async getConfig(): Promise<{ config: any }> {
    return this.request("/api/settings/config");
  }

  async saveConfig(config: any): Promise<void> {
    return this.request("/api/settings/config", {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  // ── Chat ──

  
  async sendMessage(message: string): Promise<ChatResponse> {
    return this.request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  // ── Approvals ──
  
  async getApprovals(status?: string): Promise<{ approvals: ApprovalItem[]; total: number }> {
    const params = status ? `?status=${status}` : "";
    return this.request(`/api/approvals${params}`);
  }

  async approveAction(approvalId: string, note?: string): Promise<{ approval: ApprovalItem }> {
    return this.request(`/api/approvals/${approvalId}/approve`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  }

  async rejectAction(approvalId: string, reason: string): Promise<{ approval: ApprovalItem }> {
    return this.request(`/api/approvals/${approvalId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  // ── Audit Logs ──
  
  async getAuditLogs(params?: {
    category?: string;
    severity?: string;
    runId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.severity) searchParams.set("severity", params.severity);
    if (params?.runId) searchParams.set("runId", params.runId);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    
    const query = searchParams.toString();
    return this.request(`/api/audit-logs${query ? `?${query}` : ""}`);
  }

  // ── Integrations ──
  
  async getIntegrationStatus(): Promise<{ integrations: IntegrationStatus[] }> {
    return this.request("/api/integrations/status");
  }

  async getUserIntegrationStatus(): Promise<{
    userId: string;
    services: Array<{
      provider: string;
      linked: boolean;
      isFallback: boolean;
      linkUrl?: string;
      displayName: string;
    }>;
    allLinked: boolean;
    timestamp: string;
  }> {
    return this.request("/api/integrations/user-status", { method: "POST", body: "{}" });
  }

  async getLiveStatus(): Promise<any> {
    return this.request("/api/integrations/live-status");
  }

  async getConnectInstructions(): Promise<any> {
    return this.request("/api/integrations/connect-instructions");
  }

  // ── Dashboard ──

  async getDashboardIssues(): Promise<any> {
    return this.request("/api/dashboard/issues");
  }

  async getDashboardAuditLog(): Promise<any> {
    return this.request("/api/dashboard/audit-log");
  }

  async getDashboardPrs(): Promise<any> {
    return this.request("/api/dashboard/prs");
  }

  async getDashboardApprovals(): Promise<any> {
    return this.request("/api/dashboard/approvals");
  }

  // ── Demo Mode ──

  async getDemoMode(): Promise<{ demoMode: boolean }> {
    return this.request("/api/settings/demo-mode");
  }

  async setDemoMode(enabled: boolean): Promise<{ demoMode: boolean }> {
    return this.request("/api/settings/demo-mode", {
      method: "POST",
      body: JSON.stringify({ demoMode: enabled }),
    });
  }

  /** Get Auth0 OAuth link URL for a specific service */
  async getLinkUrl(service: "github" | "jira" | "slack"): Promise<{
    service: string;
    linkUrl: string;
    connection: string;
    instructions: string[];
  }> {
    return this.request(`/api/integrations/link-url/${service}`);
  }

  // ── Health ──
  
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request("/health");
  }

  // ── Audit Trigger ──
  
  async triggerAudit(params?: {
    jiraSite?: string;
    jiraProjectKey?: string;
    githubOwner?: string;
    githubRepo?: string;
    slackChannel?: string;
  }): Promise<{
    status: string;
    runId: string;
    summary: string;
    phases: Record<string, unknown>;
    triggeredBy: string;
    timestamp: string;
  }> {
    return this.request("/api/audit/trigger", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
  }
}

// Singleton instance
export const api = new ApiClient();
