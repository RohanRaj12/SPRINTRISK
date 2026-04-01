import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fjwt from "@fastify/jwt";
import jwksClient from "jwks-rsa";
import { config } from "../config.js";

/**
 * Auth0 JWT verification plugin.
 *
 * - Fetches the JWKS from Auth0 to verify RS256 tokens
 * - Validates issuer and audience claims
 * - Decorates every request with `request.user`
 * - Skips auth for: /health, /api/webhooks/*, /api/integrations/live-status
 */

/** Paths that skip JWT verification */
const PUBLIC_PATHS = [
  "/health",
  "/api/webhooks/jira",
  "/api/webhooks/github",
  "/api/webhooks/slack",
  "/api/integrations/live-status",
  "/api/integrations/connect-instructions",
  "/api/agents/actions",
  "/api/agents/health-check",
];

function isPublicPath(url: string): boolean {
  const path = url.split("?")[0];
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  const client = jwksClient({
    jwksUri: `https://${config.auth0.domain}/.well-known/jwks.json`,
    cache: true,
    rateLimit: true,
  });

  await fastify.register(fjwt, {
    decode: { complete: true },
    secret: (_request: FastifyRequest, token: any) => {
      return new Promise((resolve, reject) => {
        const kid = token.header.kid;
        client.getSigningKey(kid, (err: Error | null, key: any) => {
          if (err) return reject(err);
          const signingKey = key?.getPublicKey();
          resolve(signingKey);
        });
      });
    },
    verify: {
      algorithms: ["RS256"],
      allowedIss: [`https://${config.auth0.domain}/`],
      allowedAud: config.auth0.audience,
    },
  });

  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip auth for public/webhook endpoints
      if (isPublicPath(request.url)) return;

      try {
        await request.jwtVerify();
      } catch (err) {
        reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid or missing access token",
        });
      }
    }
  );
});
