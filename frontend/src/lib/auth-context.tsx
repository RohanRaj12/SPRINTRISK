"use client";

/**
 * Sprint Guardian — Auth0 Authentication Context
 *
 * Lightweight Auth0 SPA integration using the redirect flow.
 * Provides login/logout and injects the access token into the API client.
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

    const config = getAuth0Config();

    try {
      const response = await fetch(`https://${config.domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: config.clientId,
          code_verifier: storedVerifier,
          code,
          redirect_uri: config.redirectUri,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${body}`);
      }

      const data = await response.json();

      sessionStorage.removeItem("pkce_verifier");
      sessionStorage.setItem("access_token", data.access_token);
      if (data.id_token) {
        sessionStorage.setItem("id_token", data.id_token);
      }

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      return true;
    } catch (err) {
      console.error("Auth callback failed:", err);
      setError(err instanceof Error ? err.message : "Authentication failed");
      sessionStorage.removeItem("pkce_verifier");
      return false;
    }
  }, []);

  // Fetch user info from the access token
  const fetchUserInfo = useCallback(async (token: string) => {
    const config = getAuth0Config();
    try {
      const response = await fetch(`https://${config.domain}/userinfo`, {
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
        // Try handling OAuth callback first
        const callbackHandled = await handleCallback();

        // Check for existing token
        const storedToken = sessionStorage.getItem("access_token");

        if (storedToken) {
          const userInfo = await fetchUserInfo(storedToken);
          if (userInfo) {
            setUser(userInfo);
            setAccessToken(storedToken);
            setIsAuthenticated(true);
            api.setAccessToken(storedToken);
          } else {
            // Token expired or invalid
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
  const login = useCallback(async () => {
    const config = getAuth0Config();

    if (!config.domain || !config.clientId) {
      setError("Auth0 is not configured. Set NEXT_PUBLIC_AUTH0_DOMAIN and NEXT_PUBLIC_AUTH0_CLIENT_ID.");
      return;
    }

    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);

    sessionStorage.setItem("pkce_verifier", verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: "openid profile email",
      audience: config.audience,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    window.location.href = `https://${config.domain}/authorize?${params}`;
  }, []);

  // Logout
  const logout = useCallback(() => {
    const config = getAuth0Config();

    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("id_token");
    setUser(null);
    setAccessToken(null);
    setIsAuthenticated(false);
    api.setAccessToken("");

    if (config.domain && config.clientId) {
      const params = new URLSearchParams({
        client_id: config.clientId,
        returnTo: config.redirectUri,
      });
      window.location.href = `https://${config.domain}/v2/logout?${params}`;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, user, accessToken, login, logout, error }}
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
