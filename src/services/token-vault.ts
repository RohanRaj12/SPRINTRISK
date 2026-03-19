import { config } from "../config.js";
import { getManagementToken } from "./auth0-management.js";

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
}

/**
 * Retrieve a short-lived delegated token from Auth0 Token Vault.
 *
 * This is the ONLY approved way to get tokens for external services.
 * It uses the Auth0 Management API to read the user's federated
 * identity tokens that were stored during social/enterprise login.
 *
 * Flow:
 *   1. Get an M2M management token (cached)
 *   2. Call GET /api/v2/users/{userId}/identities to list linked identities
 *   3. Find the identity matching the requested service connection
 *   4. Return the access_token from that identity
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

  // Step 1: Get management API token
  const mgmtToken = await getManagementToken();

  // Step 2: Fetch user's linked identities
  const response = await fetch(
    `https://${config.auth0.domain}/api/v2/users/${encodeURIComponent(userId)}`,
    {
      headers: {
        Authorization: `Bearer ${mgmtToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch user identities: ${response.status} ${body}`
    );
  }

  const user = (await response.json()) as {
    identities: Array<{
      connection: string;
      provider: string;
      access_token?: string;
      user_id: string;
    }>;
  };

  // Step 3: Find the identity for the requested service
  const identity = user.identities?.find(
    (id) =>
      id.connection.toLowerCase() === connectionName.toLowerCase() ||
      id.provider.toLowerCase() === connectionName.toLowerCase()
  );

  if (!identity) {
    throw new Error(
      `User ${userId} has no linked identity for "${connectionName}". ` +
      `Available connections: ${user.identities?.map((i) => i.connection).join(", ") || "none"}`
    );
  }

  if (!identity.access_token) {
    throw new Error(
      `Identity "${connectionName}" for user ${userId} has no access_token. ` +
      `Ensure Token Vault is enabled for this connection in the Auth0 dashboard.`
    );
  }

  return {
    access_token: identity.access_token,
    token_type: "Bearer",
    provider: service,
  };
}

/**
 * Helper: make an authenticated fetch call to an external service
 * using a delegated token from Auth0 Token Vault.
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
  const { access_token } = await getDelegatedToken(userId, service);

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${access_token}`);
  headers.set("Accept", "application/json");

  return fetch(url, {
    ...options,
    headers,
  });
}
