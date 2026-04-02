import { config, getDirectFallbackToken } from "../config.js";
import { getManagementToken } from "./auth0-management.js";
import { enforceRateLimit } from "../lib/rate-limiter.js";

/**
 * Service name → Auth0 connection name mapping.
 */
type ServiceName = "jira" | "github" | "slack";

const CONNECTION_MAP: Record<ServiceName, string> = {
  jira: config.connections.jira,
  github: config.connections.github,
  slack: config.connections.slack,
};

/**
 * Result from Token Vault containing the short-lived delegated token.
 */
export interface DelegatedToken {
  access_token: string;
  token_type: string;
  /** Connection/provider name */
  provider: ServiceName;
  /** Whether this token came from a direct fallback (not Token Vault) */
  isFallback?: boolean;
}

/**
 * Retrieve a short-lived delegated token from Auth0 Token Vault.
 *
 * This is the ONLY approved way to get tokens for external services.
 * It uses the Auth0 Management API to read the user's federated
 * identity tokens that were stored during social/enterprise login.
 *
 * Flow:
 *   1. Try Auth0 Token Vault (primary — no PATs needed)
 *   2. Fall back to direct env tokens (dev mode only)
 *   3. Throw a clear error directing user to link their account
 *
 * @param userId  - Auth0 user ID (e.g. "auth0|abc123" or "github|12345")
 * @param service - The service to get a token for ("jira" | "github" | "slack")
 */
export async function getDelegatedToken(
  userId: string,
  service: ServiceName
): Promise<DelegatedToken> {
  const connectionName = CONNECTION_MAP[service];
  if (!connectionName) {
    throw new Error(`Unknown service: ${service}`);
  }

  // ── Step 1: Try Auth0 Token Vault (primary path) ──
  try {
    const mgmtToken = await getManagementToken();

    const response = await fetch(
      `https://${config.auth0.domain}/api/v2/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${mgmtToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      const user = (await response.json()) as {
        identities: Array<{
          connection: string;
          provider: string;
          access_token?: string;
          user_id: string;
        }>;
      };

      const identity = user.identities?.find(
        (id) =>
          id.connection.toLowerCase() === connectionName.toLowerCase() ||
          id.provider.toLowerCase() === connectionName.toLowerCase()
      );

      if (identity?.access_token) {
        return {
          access_token: identity.access_token,
          token_type: "Bearer",
          provider: service,
        };
      }

      // User exists but hasn't linked this service
      console.warn(
        `[TokenVault] User ${userId} has no linked identity for "${connectionName}". ` +
        `Available: ${user.identities?.map((i) => i.connection).join(", ") || "none"}. ` +
        `Trying direct fallback...`
      );
    } else {
      const body = await response.text();
      console.warn(
        `[TokenVault] Failed to fetch user identities: ${response.status} ${body}. Trying fallback...`
      );
    }
  } catch (err) {
    console.warn(
      `[TokenVault] Auth0 Token Vault error for ${service}: ${err instanceof Error ? err.message : String(err)}. Trying fallback...`
    );
  }

  // ── Step 2: Fall back to direct env tokens (dev/hackathon mode) ──
  const fallbackToken = getDirectFallbackToken(service);
  if (fallbackToken) {
    console.info(
      `[TokenVault] Using direct env fallback for ${service} (dev mode). ` +
      `In production, link your ${service} account via Auth0.`
    );
    return {
      access_token: fallbackToken,
      token_type: service === "jira" ? "Basic" : "Bearer",
      provider: service,
      isFallback: true,
    };
  }

  // ── Step 3: No token available — clear error with user action ──
  throw new Error(
    `No ${service} token available. Please connect your ${service} account ` +
    `at the Integrations page, or set ${getEnvVarName(service)} in .env for dev mode.`
  );
}

/**
 * Check if a user has a linked identity for a service in Token Vault.
 * Returns true/false without throwing.
 */
export async function hasLinkedIdentity(
  userId: string,
  service: ServiceName
): Promise<boolean> {
  try {
    const token = await getDelegatedToken(userId, service);
    return !!token.access_token;
  } catch {
    return false;
  }
}

/**
 * Check linked status for all services for a given user.
 */
export async function getUserLinkedServices(
  userId: string
): Promise<Record<ServiceName, { linked: boolean; isFallback: boolean }>> {
  const results = await Promise.allSettled([
    getDelegatedToken(userId, "github"),
    getDelegatedToken(userId, "jira"),
    getDelegatedToken(userId, "slack"),
  ]);

  return {
    github: {
      linked: results[0].status === "fulfilled",
      isFallback: results[0].status === "fulfilled" ? !!results[0].value.isFallback : false,
    },
    jira: {
      linked: results[1].status === "fulfilled",
      isFallback: results[1].status === "fulfilled" ? !!results[1].value.isFallback : false,
    },
    slack: {
      linked: results[2].status === "fulfilled",
      isFallback: results[2].status === "fulfilled" ? !!results[2].value.isFallback : false,
    },
  };
}

/**
 * Helper: make an authenticated fetch call to an external service
 * using a delegated token from Auth0 Token Vault.
 *
 * Handles both Bearer and Basic auth modes automatically.
 *
 * @example
 * const data = await fetchWithDelegatedToken(userId, "github", "https://api.github.com/repos/...");
 */
export async function fetchWithDelegatedToken(
  userId: string,
  service: ServiceName,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Enforce per-service rate limits before making the call
  await enforceRateLimit(service);

  const { access_token, token_type, isFallback } = await getDelegatedToken(userId, service);
  console.info(`[TokenVault] Using ${token_type} token for ${service} (fallback: ${!!isFallback}) to ${url}`);

  const headers = new Headers(options.headers);

  // Jira Basic Auth uses "Basic <base64>", OAuth Bearer uses "Bearer <token>"
  if (token_type === "Basic") {
    headers.set("Authorization", `Basic ${access_token}`);
  } else {
    headers.set("Authorization", `Bearer ${access_token}`);
  }

  headers.set("Accept", "application/json");

  const res = await fetch(url, {
    ...options,
    headers,
  });
  console.info(`[TokenVault] Response from ${service}: ${res.status}`);
  return res;
}

// ── Internal helpers ──

function getEnvVarName(service: ServiceName): string {
  switch (service) {
    case "github": return "GITHUB_TOKEN";
    case "slack": return "SLACK_BOT_TOKEN";
    case "jira": return "JIRA_HOST + JIRA_EMAIL + JIRA_API_TOKEN";
  }
}
