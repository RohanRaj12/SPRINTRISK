import { config } from "../config.js";

/**
 * Cached M2M access token for the Auth0 Management API.
 * We cache it in memory and refresh when it expires.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an M2M access token for the Auth0 Management API.
 * Uses client_credentials grant (server-to-server, no user context).
 */
export async function getManagementToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const response = await fetch(
    `https://${config.auth0.domain}/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: config.auth0.m2mClientId,
        client_secret: config.auth0.m2mClientSecret,
        audience: `https://${config.auth0.domain}/api/v2/`,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to get Management API token: ${response.status} ${body}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}
