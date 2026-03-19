/**
 * Tool definition that the Gemini agent can call.
 * Each tool has a name, description, parameter schema, and an execute function.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  required: string[];
  execute: (args: Record<string, unknown>, userId: string) => Promise<unknown>;
}

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "array";
  description: string;
  enum?: string[];
  items?: { type: string };
}

/**
 * Registry of all available tools.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Returns tool declarations in the format Gemini expects
   * for function calling.
   */
  toGeminiTools() {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object" as const,
        properties: tool.parameters,
        required: tool.required,
      },
    }));
  }
}
