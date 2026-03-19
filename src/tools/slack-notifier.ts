import { fetchWithDelegatedToken } from "../services/index.js";
import type { ToolDefinition } from "./types.js";

/**
 * slack_notifier
 *
 * Sends sprint health notifications to a Slack channel or
 * direct messages to specific developers.
 *
 * All API calls use delegated tokens from Auth0 Token Vault.
 */

interface SlackPostResponse {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
}

/**
 * Look up a Slack user ID by email address.
 */
async function lookupUserByEmail(
  userId: string,
  email: string
): Promise<string | null> {
  const url = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`;
  const response = await fetchWithDelegatedToken(userId, "slack", url);

  if (!response.ok) return null;

  const data = (await response.json()) as {
    ok: boolean;
    user?: { id: string };
  };

  return data.ok ? data.user?.id ?? null : null;
}

export const slackNotifier: ToolDefinition = {
  name: "slack_notifier",
  description:
    "Send a sprint health notification via Slack. Can post to a channel " +
    "or DM a specific developer by email. Use this to alert the team about " +
    "stale tickets, failing CI, or review bottlenecks.",
  parameters: {
    channel: {
      type: "string",
      description:
        'Slack channel name or ID to post to (e.g. "#engineering", "C01ABCDEF"). ' +
        "Omit if sending a DM via developer_email instead.",
    },
    developer_email: {
      type: "string",
      description:
        "Email address of the developer to DM. If provided, the message " +
        "will be sent as a direct message instead of to a channel.",
    },
    message: {
      type: "string",
      description:
        "The notification message to send. Supports Slack mrkdwn formatting.",
    },
    severity: {
      type: "string",
      description: "Severity level that controls the emoji and color of the notification.",
      enum: ["info", "warning", "critical"],
    },
  },
  required: ["message"],

  async execute(args, userId) {
    const channel = args.channel as string | undefined;
    const developerEmail = args.developer_email as string | undefined;
    const message = args.message as string;
    const severity = (args.severity as string) ?? "info";

    // Determine target
    let target: string;

    if (developerEmail) {
      // Look up user by email and DM them
      const slackUserId = await lookupUserByEmail(userId, developerEmail);
      if (!slackUserId) {
        return {
          success: false,
          error: `Could not find Slack user with email: ${developerEmail}`,
        };
      }
      target = slackUserId;
    } else if (channel) {
      target = channel.startsWith("#") ? channel.slice(1) : channel;
    } else {
      return {
        success: false,
        error:
          'Either "channel" or "developer_email" must be provided.',
      };
    }

    // Build Slack Block Kit message
    const severityConfig = {
      info: { emoji: "ℹ️", color: "#36a64f" },
      warning: { emoji: "⚠️", color: "#ff9900" },
      critical: { emoji: "🚨", color: "#dc3545" },
    }[severity] ?? { emoji: "ℹ️", color: "#36a64f" };

    const payload = {
      channel: target,
      text: `${severityConfig.emoji} Sprint Guardian Alert`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${severityConfig.emoji} Sprint Guardian Alert`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Severity: *${severity}* | Sent by Sprint Guardian at ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    const url = "https://slack.com/api/chat.postMessage";
    const response = await fetchWithDelegatedToken(userId, "slack", url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as SlackPostResponse;

    if (!data.ok) {
      return {
        success: false,
        error: `Slack API error: ${data.error}`,
      };
    }

    return {
      success: true,
      channel: data.channel,
      timestamp: data.ts,
      message: `Notification sent${developerEmail ? ` to ${developerEmail}` : ` to #${target}`}`,
    };
  },
};
