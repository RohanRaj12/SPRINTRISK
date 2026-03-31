/**
 * Sprint Guardian — AI Client Abstraction
 *
 * Supports multiple AI providers via a unified interface:
 * - Groq (default, free tier, OpenAI-compatible, Llama 3.3 70B)
 * - Gemini (Google, fallback)
 *
 * Set AI_PROVIDER=groq|gemini and the corresponding API key in .env
 */

import OpenAI from "openai";

// ── Types ──

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AIClient {
  chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse>;
  chatJSON<T = unknown>(messages: AIMessage[], options?: ChatOptions): Promise<T>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

// ── Groq Client (OpenAI-compatible) ──

function createGroqClient(apiKey: string): AIClient {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const defaultModel = "llama-3.3-70b-versatile";

  return {
    async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
      const response = await client.chat.completions.create({
        model: options?.model ?? defaultModel,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
      });

      return {
        content: response.choices[0]?.message?.content ?? "",
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    },

    async chatJSON<T = unknown>(messages: AIMessage[], options?: ChatOptions): Promise<T> {
      const response = await client.chat.completions.create({
        model: options?.model ?? defaultModel,
        messages,
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: { type: "json_object" },
      });

      const text = response.choices[0]?.message?.content ?? "{}";
      return JSON.parse(text) as T;
    },
  };
}

// ── Gemini Client (via OpenAI-compatible endpoint) ──

function createGeminiClient(apiKey: string): AIClient {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });

  const defaultModel = "gemini-2.0-flash";

  return {
    async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
      const response = await client.chat.completions.create({
        model: options?.model ?? defaultModel,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
      });

      return {
        content: response.choices[0]?.message?.content ?? "",
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    },

    async chatJSON<T = unknown>(messages: AIMessage[], options?: ChatOptions): Promise<T> {
      const response = await client.chat.completions.create({
        model: options?.model ?? defaultModel,
        messages,
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: { type: "json_object" },
      });

      const text = response.choices[0]?.message?.content ?? "{}";
      return JSON.parse(text) as T;
    },
  };
}

// ── Factory ──

let _client: AIClient | null = null;

export function getAIClient(): AIClient {
  if (_client) return _client;

  const provider = (process.env.AI_PROVIDER ?? "groq").toLowerCase();

  if (provider === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
    _client = createGeminiClient(key);
  } else {
    // Default: Groq
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY is required. Get a free key at https://console.groq.com");
    _client = createGroqClient(key);
  }

  console.log(`[AI] Using provider: ${provider}`);
  return _client;
}

export function resetAIClient(): void {
  _client = null;
}
