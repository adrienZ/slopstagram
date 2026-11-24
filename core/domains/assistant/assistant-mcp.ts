import type { FlexibleSchema, ToolSet } from "ai";
import { z } from "zod";
import {
  createMcpHandler,
  McpServer,
  type CallToolResult,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import packageJson from "@@/package.json" with { type: "json" };
import { JsonValueSchema, type JsonValue } from "@@/core/utils/json-value.ts";
import { createAssistantTools, type AssistantToolsRuntime } from "./assistant-tools.ts";

type AssistantTool = ToolSet[string];

const ToolOutputSchema = z.record(z.string(), JsonValueSchema);

async function runTool(tool: AssistantTool, input: JsonValue): Promise<CallToolResult> {
  if (tool.execute === undefined) {
    throw new Error("an Assistant tool always has an execute function");
  }

  const output: unknown = await tool.execute(input, {
    context: undefined,
    messages: [],
    toolCallId: "mcp",
  });

  // A tool returns one object: parsing it also rejects a streamed result.
  const structuredContent = ToolOutputSchema.parse(output);

  return {
    content: [{ text: JSON.stringify(structuredContent), type: "text" }],
    structuredContent,
  };
}

/** Assistant tools are declared with zod, which MCP takes as is. */
function toZod(schema: FlexibleSchema<unknown>): z.ZodType {
  if (!(schema instanceof z.ZodType)) {
    throw new TypeError("an Assistant tool declares its schemas with zod");
  }

  return schema;
}

function registerTools(server: McpServer, tools: ToolSet) {
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(
      name,
      {
        description: z.string().parse(tool.description),
        inputSchema: toZod(tool.inputSchema),
        outputSchema: tool.outputSchema === undefined ? undefined : toZod(tool.outputSchema),
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
