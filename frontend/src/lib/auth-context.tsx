"use client";

/**
 * Sprint Guardian — Auth0 Authentication Context
 *
 * Lightweight Auth0 SPA integration using the redirect flow.
 * Provides login/logout/linkAccount and injects the access token into the API client.
 *
 * Required env vars (in frontend/.env.local):
 *   NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.us.auth0.com
 *   NEXT_PUBLIC_AUTH0_CLIENT_ID=<SPA client ID>
 *   NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.sprint-guardian.com
 *   NEXT_PUBLIC_AUTH0_REDIRECT_URI=http://localhost:3000
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "./api";

// ── Types ──

interface User {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  org_id?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  accessToken: string | null;
  login: () => void;
  logout: () => void;
  /** Link an external identity (GitHub, Jira, Slack) via Auth0 OAuth */
  linkAccount: (connection: string) => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── PKCE Helpers ──

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ── Auth0 Config ──

function getAuth0Config() {
  return {
    domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN ?? "",
    clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID ?? "",
    audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE ?? "",
    redirectUri:
      process.env.NEXT_PUBLIC_AUTH0_REDIRECT_URI ??
      (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"),
  };
}

// ── Provider ──

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle the OAuth callback (code exchange)
  const handleCallback = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const storedVerifier = sessionStorage.getItem("pkce_verifier");

    if (!code || !storedVerifier) return false;

    const authConfig = getAuth0Config();
    const linkingConnection = sessionStorage.getItem("linking_connection");

    try {
      // Determine the correct redirect_uri based on whether this was a link or login
      const redirectUri = linkingConnection
        ? `${window.location.origin}/integrations`
        : authConfig.redirectUri;

      const response = await fetch(`https://${authConfig.domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: authConfig.clientId,
          code_verifier: storedVerifier,
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${body}`);
      }

      const data = await response.json();
      sessionStorage.removeItem("pkce_verifier");

      if (linkingConnection) {
        // ── LINK FLOW: Don't replace the primary session ──
        // Use the provider ID (e.g. "slack") not the connection name (e.g. "sign-in-with-slack")
        const providerId = sessionStorage.getItem("linking_provider_id") || linkingConnection;

        // Mark this service as connected in localStorage
        const connected = JSON.parse(localStorage.getItem("sg_connected_services") || "{}");
        connected[providerId] = { linked: true, linkedAt: new Date().toISOString() };
        localStorage.setItem("sg_connected_services", JSON.stringify(connected));

        // Restore the original GitHub session
        const preToken = sessionStorage.getItem("pre_link_access_token");
        const preIdToken = sessionStorage.getItem("pre_link_id_token");
        if (preToken) sessionStorage.setItem("access_token", preToken);
        if (preIdToken) sessionStorage.setItem("id_token", preIdToken);

        // Clean up link-specific storage
        sessionStorage.removeItem("linking_connection");
        sessionStorage.removeItem("linking_provider_id");
        sessionStorage.removeItem("pre_link_access_token");
        sessionStorage.removeItem("pre_link_id_token");

        console.info(`[Auth] Successfully linked ${providerId}. Primary session preserved.`);
      } else {
        // ── PRIMARY LOGIN FLOW: Store tokens normally ──
        sessionStorage.setItem("access_token", data.access_token);
        if (data.id_token) {
          sessionStorage.setItem("id_token", data.id_token);
        }
      }

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      return true;
    } catch (err) {
      console.error("Auth callback failed:", err);
      setError(err instanceof Error ? err.message : "Authentication failed");
      sessionStorage.removeItem("pkce_verifier");
      sessionStorage.removeItem("linking_connection");
      sessionStorage.removeItem("linking_provider_id");
      sessionStorage.removeItem("pre_link_access_token");
      sessionStorage.removeItem("pre_link_id_token");
      return false;
    }
  }, []);

  // Fetch user info from the access token
  const fetchUserInfo = useCallback(async (token: string) => {
    const authConfig = getAuth0Config();
    try {
      const response = await fetch(`https://${authConfig.domain}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return null;

      const userInfo = await response.json();
      return {
        sub: userInfo.sub,
        name: userInfo.name,
        email: userInfo.email,
        picture: userInfo.picture,
        org_id: userInfo.org_id,
      } as User;
    } catch {
      return null;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    async function init() {
      try {
        await handleCallback();

        const storedToken = sessionStorage.getItem("access_token");

        if (storedToken) {
          // Use id_token for API requests instead of access_token to bypass custom API strictness
          const idToken = sessionStorage.getItem("id_token");
          
          const userInfo = await fetchUserInfo(storedToken);
          if (userInfo) {
            setUser(userInfo);
            setAccessToken(storedToken); // Opaque token kept for Auth0 /userinfo
            setIsAuthenticated(true);
            api.setAccessToken(idToken || storedToken); // Send JWT to our backend
          } else {
            sessionStorage.removeItem("access_token");
            sessionStorage.removeItem("id_token");
          }
        }
      } catch (err) {
        console.error("Auth init failed:", err);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [handleCallback, fetchUserInfo]);

  // Login via Auth0 authorize redirect (PKCE)
  // Defaults to GitHub as the identity provider — no generic login page needed
  const login = useCallback(async () => {
    const authConfig = getAuth0Config();

    if (!authConfig.domain || !authConfig.clientId) {
      setError("Auth0 is not configured. Set NEXT_PUBLIC_AUTH0_DOMAIN and NEXT_PUBLIC_AUTH0_CLIENT_ID.");
      return;
    }

    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);

    sessionStorage.setItem("pkce_verifier", verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: authConfig.clientId,
      redirect_uri: authConfig.redirectUri,
      scope: "openid profile email",
      connection: "github",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    window.location.href = `https://${authConfig.domain}/authorize?${params}`;
  }, []);

  /**
   * Link an external identity (GitHub, Jira/Atlassian, Slack) via Auth0 OAuth.
   *
   * Uses Option A: "silent re-authorize" — redirect to Auth0 with a specific
   * connection parameter. Auth0 links the new IdP token to the existing user
   * and stores it in Token Vault.
   */
  const linkAccount = useCallback(async (connection: string) => {
    const authConfig = getAuth0Config();

    if (!authConfig.domain || !authConfig.clientId) {
      setError("Auth0 is not configured.");
      return;
    }

    // ── Save the current primary session before redirecting ──
    const currentToken = sessionStorage.getItem("access_token");
    const currentIdToken = sessionStorage.getItem("id_token");
    if (currentToken) {
      sessionStorage.setItem("pre_link_access_token", currentToken);
    }
    if (currentIdToken) {
      sessionStorage.setItem("pre_link_id_token", currentIdToken);
    }
    sessionStorage.setItem("linking_connection", connection);

    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);

    sessionStorage.setItem("pkce_verifier", verifier);
    sessionStorage.setItem("link_redirect", window.location.pathname);

    const redirectUri = `${window.location.origin}/integrations`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: authConfig.clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email",
      connection,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    window.location.href = `https://${authConfig.domain}/authorize?${params}`;
  }, []);

  // Logout
  const logout = useCallback(() => {
    const authConfig = getAuth0Config();

    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("id_token");
    setUser(null);
    setAccessToken(null);
    setIsAuthenticated(false);
    api.setAccessToken("");

    if (authConfig.domain && authConfig.clientId) {
      const params = new URLSearchParams({
        client_id: authConfig.clientId,
        returnTo: authConfig.redirectUri,
      });
      window.location.href = `https://${authConfig.domain}/v2/logout?${params}`;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, user, accessToken, login, logout, linkAccount, error }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
