import { z } from "zod";
import {
  createMcpHandler,
  McpServer,
  type CallToolResult,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import packageJson from "@@/package.json" with { type: "json" };
import type { AssistantTool } from "@@/core/utils/assistant-tool.ts";
import { JsonValueSchema, type JsonValue } from "@@/core/utils/json-value.ts";
import { createAssistantTools, type AssistantToolsRuntime } from "./assistant-tools.ts";

const ToolOutputSchema = z.record(z.string(), JsonValueSchema);

async function runTool(tool: AssistantTool, input: JsonValue): Promise<CallToolResult> {
  const output = await tool.execute(input);

  // A tool returns one object: parsing it also rejects a streamed result.
  const structuredContent = ToolOutputSchema.parse(output);

  return {
    content: [{ text: JSON.stringify(structuredContent), type: "text" }],
    structuredContent,
  };
}

function registerTools(server: McpServer, tools: Record<string, AssistantTool>) {
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(
      name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      async (input) => await runTool(tool, JsonValueSchema.parse(input)),
    );
  }
}

/** Serves the Assistant tools over MCP, so other agents read the same data as the chat. */
export function createAssistantMcpHandler(runtime: AssistantToolsRuntime): McpHttpHandler {
  const tools = createAssistantTools(runtime);

  return createMcpHandler(() => {
    const server = new McpServer({ name: "slopstagram", version: packageJson.version });
    registerTools(server, tools);

    return server;
  });
}
