import { getAIClient, type AIMessage } from "../lib/ai-client.js";
import { type ToolRegistry } from "../tools/types.js";

// ── Constants ──

const MAX_TOOL_ROUNDS = 10;

const SYSTEM_INSTRUCTION = `You are Sprint Guardian, an AI agent that audits engineering sprint health.

Your capabilities:
1. **jira_analyzer** — Query Jira for stale tickets in a sprint or project.
2. **github_investigator** — Check open PRs, CI status, and review bottlenecks.
3. **slack_notifier** — Send notifications to Slack channels or DM developers.

Behavior rules:
- When asked to audit a sprint, use the tools in sequence: Jira → GitHub → Slack.
- Always provide a clear, concise summary of findings.
- If a tool returns errors (e.g. missing credentials), explain the issue to the user.
- Use markdown formatting in your responses.
- Be proactive: if you find stale tickets AND failing CI on the same repo, mention the correlation.
- For Slack notifications, suggest appropriate severity levels based on findings.

IMPORTANT: You have access to tools. When you want to call a tool, include a JSON code block like this:
\`\`\`tool_call
{"tool": "tool_name", "args": {"param1": "value1"}}
\`\`\`

Available tools and their parameters will be provided in the conversation.
`;

/**
 * Result from running the agent.
 */
export interface AgentResult {
  /** Final text response from the agent */
  response: string;
  /** All tool calls that were made during execution */
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  /** Number of agent loop iterations */
  rounds: number;
}

/**
 * Extract tool calls from agent text response.
 */
function extractToolCalls(text: string): Array<{ tool: string; args: Record<string, unknown> }> {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const regex = /```tool_call\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.tool) {
        calls.push({ tool: parsed.tool, args: parsed.args || {} });
      }
    } catch {
      // Ignore malformed tool calls
    }
  }
  return calls;
}

/**
 * Run the Sprint Guardian agent loop.
 *
 * Uses the AI client abstraction (Groq or Gemini) with a text-based
 * tool-calling protocol. The agent outputs tool_call blocks which we
 * parse, execute, and feed results back.
 */
export async function runAgent(
  message: string,
  userId: string,
  registry: ToolRegistry,
  history: AIMessage[] = []
): Promise<AgentResult> {
  const ai = getAIClient();

  // Build tool descriptions for the system prompt
  const toolDescriptions = registry.getAll().map((tool) => {
    const params = Object.entries(tool.parameters)
      .map(([k, v]) => `  - ${k} (${v.type}${tool.required.includes(k) ? ", required" : ""}): ${v.description}`)
      .join("\n");
    return `### ${tool.name}\n${tool.description}\nParameters:\n${params}`;
  }).join("\n\n");

  const systemPrompt = SYSTEM_INSTRUCTION + "\n\n## Available Tools\n\n" + toolDescriptions;

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  const allToolCalls: AgentResult["toolCalls"] = [];
  let rounds = 0;

  try {
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const response = await ai.chat(messages, { temperature: 0.3, maxTokens: 4096 });
      const text = response.content;

      // Check for tool calls in the response
      const toolCalls = extractToolCalls(text);

      if (toolCalls.length === 0) {
        // No tool calls — this is the final response
        return { response: text, toolCalls: allToolCalls, rounds };
      }

      // Add assistant response to history
      messages.push({ role: "assistant", content: text });

      // Execute tool calls and collect results
      const results: string[] = [];
      for (const tc of toolCalls) {
        const tool = registry.get(tc.tool);
        let toolResult: unknown;

        if (!tool) {
          toolResult = { error: `Unknown tool: ${tc.tool}` };
        } else {
          try {
            toolResult = await tool.execute(tc.args, userId);
          } catch (err) {
            toolResult = {
              error: `Tool "${tc.tool}" failed: ${err instanceof Error ? err.message : String(err)}`,
            };
          }
        }

        allToolCalls.push({ tool: tc.tool, args: tc.args, result: toolResult });
        results.push(`## Result from ${tc.tool}:\n\`\`\`json\n${JSON.stringify(toolResult, null, 2)}\n\`\`\``);
      }

      // Feed results back as user message
      messages.push({ role: "user", content: results.join("\n\n") });
    }

    // Max rounds exceeded
    return {
      response: "I reached the maximum number of tool iterations. Here's what I found so far based on the tool results above.",
      toolCalls: allToolCalls,
      rounds,
    };
  } catch (err: any) {
    if (err.message?.includes("429") || err.message?.includes("rate")) {
      return {
        response: "⚠️ **AI Rate Limit Exceeded**\n\nPlease wait a moment and try again. If this persists, check your API key quota.",
        toolCalls: allToolCalls,
        rounds,
      };
    }
    throw err;
  }
}
