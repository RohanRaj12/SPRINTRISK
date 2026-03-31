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
 */
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

  // @fastify/jwt automatically decorates request with `user` after jwtVerify()
  // Pre-handler hook: verify JWT on every request that opts in
  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip health-check
      if (request.url === "/health") return;

      // Allow local development bypass for ease of testing Sprint Guardian UI
      if (!request.headers.authorization && process.env.NODE_ENV !== "production") {
        request.user = { sub: "auth0|local-dev-user" };
        return;
      }

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
