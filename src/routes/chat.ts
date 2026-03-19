import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { runAgent } from "../agent/index.js";
import { createToolRegistry } from "../tools/index.js";

/**
 * POST /chat
 *
 * Accepts a natural-language prompt from an authenticated user,
 * runs the Sprint Guardian agent loop (Gemini + tools), and
 * returns the agent's response.
 */

interface ChatBody {
  message: string;
}

// Shared tool registry (created once, reused across requests)
const registry = createToolRegistry();

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: ChatBody }>(
    "/chat",
    {
      schema: {
        body: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: ChatBody }>, reply: FastifyReply) => {
      const { message } = request.body;
      const user = request.user as Record<string, unknown>;
      const userId = user.sub as string;

      request.log.info(
        { userId, messageLength: message.length },
        "Processing chat request"
      );

      try {
        const result = await runAgent(message, userId, registry);

        request.log.info(
          {
            userId,
            rounds: result.rounds,
            toolCalls: result.toolCalls.length,
          },
          "Agent completed"
        );

        return {
          reply: result.response,
          toolCalls: result.toolCalls.map((tc) => ({
            tool: tc.tool,
            args: tc.args,
          })),
          meta: {
            rounds: result.rounds,
            totalToolCalls: result.toolCalls.length,
          },
        };
      } catch (err) {
        request.log.error(err, "Agent execution failed");
        reply.status(500).send({
          error: "Agent execution failed",
          message:
            err instanceof Error ? err.message : "Unknown error occurred",
        });
      }
    }
  );
}
