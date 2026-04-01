/**
 * Sprint Guardian — Slack Integration Client
 *
 * Production Slack Web API client using Bot tokens.
 *
 * Required Slack App Configuration:
 *   Bot Token Scopes:
 *     - chat:write        (post messages)
 *     - channels:read     (list channels)
 *     - channels:history  (read channel messages)
 *     - users:read        (lookup users)
 *     - users:read.email  (lookup by email)
 *     - reactions:write   (add reactions)
 *     - im:write          (open DMs)
 *
 *   Event Subscriptions:
 *     - message.channels  (channel messages)
 *     - app_mention       (bot mentions)
 *
 * Auth modes:
 *   1. Direct Bot Token (SLACK_BOT_TOKEN) — for hackathon/demo
 *   2. Auth0 Token Vault — for enterprise
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { config, hasDirectSlack } from "../config.js";

const SLACK_API = "https://slack.com/api";

// ── Types ──

export interface SlackAuthTestResult {
  ok: boolean;
  url: string;
  team: string;
  team_id: string;
  user: string;
  user_id: string;
  bot_id: string;
  is_enterprise_install: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
  is_private: boolean;
  num_members: number;
  topic: { value: string };
  purpose: { value: string };
}

export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  profile: {
    email?: string;
    image_48: string;
    display_name: string;
  };
  is_bot: boolean;
}

export interface SlackMessage {
  ok: boolean;
  channel: string;
  ts: string;
  error?: string;
}

export interface ConnectionTestResult {
  connected: boolean;
  team?: string;
  botUser?: string;
  teamId?: string;
  error?: string;
  scopes?: string[];
}

// ── Slack Client ──

class SlackClient {
  private botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  private async request<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${SLACK_API}/${method}`;
    const options: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = (await response.json()) as T & { ok: boolean; error?: string };

    if (!data.ok) {
      throw new Error(`Slack API error (${method}): ${data.error ?? "unknown"}`);
    }

    return data;
  }

  private async requestGet<T>(method: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${SLACK_API}/${method}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    const data = (await response.json()) as T & { ok: boolean; error?: string };

    if (!data.ok) {
      throw new Error(`Slack API error (${method}): ${data.error ?? "unknown"}`);
    }

    return data;
  }

  // ── Connection Test ──

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const result = await this.requestGet<SlackAuthTestResult>("auth.test");
      return {
        connected: true,
        team: result.team,
        botUser: result.user,
        teamId: result.team_id,
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Channels ──

  async listChannels(limit = 100): Promise<SlackChannel[]> {
    const data = await this.requestGet<{ channels: SlackChannel[] }>(
      "conversations.list",
      { types: "public_channel", limit: String(limit), exclude_archived: "true" }
    );
    return data.channels;
  }

  // ── Users ──

  async lookupUserByEmail(email: string): Promise<SlackUser | null> {
    try {
      const data = await this.requestGet<{ user: SlackUser }>(
        "users.lookupByEmail",
        { email }
      );
      return data.user;
    } catch {
      return null;
    }
  }

  async getUserInfo(userId: string): Promise<SlackUser> {
    const data = await this.requestGet<{ user: SlackUser }>(
      "users.info",
      { user: userId }
    );
    return data.user;
  }

  // ── Messaging ──

  async postMessage(
    channel: string,
    text: string,
    blocks?: unknown[]
  ): Promise<SlackMessage> {
    return this.request<SlackMessage>("chat.postMessage", {
      channel,
      text,
      ...(blocks ? { blocks } : {}),
    });
  }

  /** Post a rich sprint health alert with Block Kit */
  async postSprintAlert(
    channel: string,
    severity: "info" | "warning" | "critical",
    title: string,
    message: string,
    fields?: Array<{ label: string; value: string }>
  ): Promise<SlackMessage> {
    const severityConfig = {
      info: { emoji: ":information_source:", color: "#36a64f" },
      warning: { emoji: ":warning:", color: "#ff9900" },
      critical: { emoji: ":rotating_light:", color: "#dc3545" },
    }[severity];

    const blocks: unknown[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `${severityConfig.emoji} ${title}`, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: message },
      },
    ];

    if (fields && fields.length > 0) {
      blocks.push({
        type: "section",
        fields: fields.map((f) => ({
          type: "mrkdwn",
          text: `*${f.label}:*\n${f.value}`,
        })),
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Severity: *${severity}* | Sent by Sprint Guardian at ${new Date().toISOString()}`,
        },
      ],
    });

    return this.postMessage(channel, `${severityConfig.emoji} ${title}`, blocks);
  }

  /** Send DM to a user by email */
  async sendDM(email: string, text: string): Promise<SlackMessage | null> {
    const user = await this.lookupUserByEmail(email);
    if (!user) return null;

    // Open DM channel
    const dm = await this.request<{ channel: { id: string } }>("conversations.open", {
      users: user.id,
    });

    return this.postMessage(dm.channel.id, text);
  }

  // ── Reactions ──

  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    await this.request("reactions.add", {
      channel,
      timestamp,
      name: emoji,
    });
  }
}

// ── Webhook Signature Verification ──

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  if (!signingSecret || !signature) return false;

  // Reject requests older than 5 minutes (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret);
  const mySignature = `v0=${hmac.update(sigBasestring).digest("hex")}`;

  return timingSafeEqual(
    Buffer.from(mySignature, "utf8"),
    Buffer.from(signature, "utf8")
  );
}

// ── Singleton ──

let _client: SlackClient | null = null;

export function getSlackClient(): SlackClient | null {
  if (_client) return _client;
  if (!hasDirectSlack()) return null;
  _client = new SlackClient(config.slack.botToken);
  return _client;
}

export function createSlackClientWithToken(token: string): SlackClient {
  return new SlackClient(token);
}

export { SlackClient };
