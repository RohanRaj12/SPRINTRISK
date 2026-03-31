import {
  GoogleGenerativeAI,
  FunctionCallingMode,
  SchemaType,
  type Content,
  type FunctionDeclaration,
  type Part,
} from "@google/generative-ai";
import { config } from "../config.js";
import { type ToolRegistry } from "../tools/types.js";
import { getDataSource } from "../data/index.js";

// ── Constants ──

const MODEL_NAME = "gemini-2.0-flash";
const MAX_TOOL_ROUNDS = 10; // safety valve to prevent infinite loops

const SYSTEM_INSTRUCTION = `You are Sprint Guardian, an AI agent that audits engineering sprint health.

Your capabilities:
1. **jira_analyzer** — Query Jira for stale tickets in a sprint or project.
2. **github_investigator** — Check open PRs, CI status, and review bottlenecks.
3. **slack_notifier** — Send notifications to Slack channels or DM developers.

Behavior rules:
- When asked to audit a sprint, use the tools in sequence: Jira → GitHub → Slack.
- Always provide a clear, concise summary of findings.
- If a tool returns errors (e.g. missing credentials), explain the issue to the user.
- If the user has not connected integrations and you are in live mode, tell them: "No data available. Please connect your integrations."
- Use markdown formatting in your responses.
- Be proactive: if you find stale tickets AND failing CI on the same repo, mention the correlation.
- For Slack notifications, suggest appropriate severity levels based on findings.
`;

/**
 * Convert our ToolRegistry into Gemini-compatible FunctionDeclarations.
 */
function toolsToGeminiFunctions(
  registry: ToolRegistry
): FunctionDeclaration[] {
  return registry.getAll().map((tool) => {
    const properties: Record<string, unknown> = {};

    for (const [key, param] of Object.entries(tool.parameters)) {
      const prop: Record<string, unknown> = {
        type: schemaTypeFromString(param.type),
        description: param.description,
      };
      if (param.enum) prop.enum = param.enum;
      if (param.items) prop.items = { type: schemaTypeFromString(param.items.type) };
      properties[key] = prop;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties,
        required: tool.required,
      },
    } as FunctionDeclaration;
  });
}

function schemaTypeFromString(type: string): SchemaType {
  const map: Record<string, SchemaType> = {
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    integer: SchemaType.INTEGER,
    boolean: SchemaType.BOOLEAN,
    array: SchemaType.ARRAY,
    object: SchemaType.OBJECT,
  };
  return map[type] ?? SchemaType.STRING;
}

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
 * Run the Sprint Guardian agent loop.
 *
 * This is a custom agentic loop (no LangChain) that:
 *  1. Sends the user message + tool declarations to Gemini
 *  2. If Gemini returns function calls, executes them via ToolRegistry
 *  3. Sends the results back to Gemini as FunctionResponse parts
 *  4. Repeats until Gemini returns a text response (or MAX_TOOL_ROUNDS)
 *
 * @param message  - User's natural language prompt
 * @param userId   - Auth0 user ID (for Token Vault delegation)
 * @param registry - Tool registry containing all available tools
 * @param demoMode - Whether the agent should run in demo mode
 * @param history  - Optional conversation history for multi-turn
 */
export async function runAgent(
  message: string,
  userId: string,
  registry: ToolRegistry,
  demoMode: boolean = false,
  history: Content[] = []
): Promise<AgentResult> {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_INSTRUCTION + (demoMode ? "\n\nCRITICAL: You are running in DEMO MODE. The tools will return static demo data. Acknowledge that you are running a simulated audit." : "\n\nCRITICAL: You are running in LIVE MODE against real production APIs."),
    tools: [
      {
        functionDeclarations: toolsToGeminiFunctions(registry),
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.AUTO,
      },
    },
  });

  // Start a chat session with history
  const chat = model.startChat({ history });

  const allToolCalls: AgentResult["toolCalls"] = [];
  let rounds = 0;

  // Initial user message
  try {
    let result = await chat.sendMessage(message);
    let response = result.response;

    // ── Agent loop ──
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const functionCalls = response.functionCalls();

      // No function calls → Gemini returned a final text response
      if (!functionCalls || functionCalls.length === 0) {
        break;
      }

      // Execute all function calls in parallel
      const functionResponses: Part[] = await Promise.all(
        functionCalls.map(async (fc) => {
          const tool = registry.get(fc.name);

          let toolResult: unknown;
          if (!tool) {
            toolResult = { error: `Unknown tool: ${fc.name}` };
          } else if (demoMode) {
            // In demo mode, intercept tool calls and return static responses
            // to prevent mutating live systems via Token Vault.
            const ds = getDataSource(true);
            
            if (fc.name === "jira_analyzer") {
              const issues = await ds.getSprintIssues(userId);
              toolResult = {
                status: "success",
                note: "Simulated Jira Analysis (Demo Mode)",
                staleTickets: issues.filter(i => i.provider === "jira" && ((i as any).daysStale || 0) > 2)
              };
            } else if (fc.name === "github_investigator") {
              const prs = await ds.getGithubPRs(userId);
              toolResult = {
                status: "success",
                note: "Simulated GitHub PRs (Demo Mode)",
                openPRs: prs,
                failingBuilds: prs.filter(pr => pr.ciStatus.includes("failing"))
              };
            } else {
              toolResult = {
                 status: "success",
                 note: `Demo mode active. Simulated execution of ${fc.name}.`,
                 simulated_data: true
              };
            }
          } else {
            try {
              toolResult = await tool.execute(
                fc.args as Record<string, unknown>,
                userId
              );
            } catch (err) {
              toolResult = {
                error: `Tool "${fc.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
              };
            }
          }

          allToolCalls.push({
            tool: fc.name,
            args: fc.args as Record<string, unknown>,
            result: toolResult,
          });

          return {
            functionResponse: {
              name: fc.name,
              response: toolResult as object,
            },
          };
        })
      );

      // Send all function responses back to Gemini in one turn
      result = await chat.sendMessage(functionResponses);
      response = result.response;
    }

    // Extract final text
    const finalText =
      response.text() ||
      "I completed the analysis but couldn't generate a summary. Please check the tool results.";

    return {
      response: finalText,
      toolCalls: allToolCalls,
      rounds,
    };
  } catch (err: any) {
    if (err.message && err.message.includes("429")) {
      return {
        response: "⚠️ **Google Gemini AI Rate Limit Exceeded**\n\nThe free tier of the Gemini API has a strict requests-per-minute quota which was just hit. \n\nHowever, behind the scenes, your Sprint Guardian dashboard is fully functional. Please wait a minute for the quota to reset, or provide a paid Gemini API key in your `.env` file to remove this restriction.",
        toolCalls: allToolCalls,
        rounds
      };
    }
    throw err;
  }
}
