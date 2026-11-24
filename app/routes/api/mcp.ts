import { createFileRoute } from "@tanstack/react-router";
import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { createAssistantMcpHandler } from "@@/core/domains/assistant/assistant-mcp.ts";
import type { AssistantToolsRuntime } from "@@/core/domains/assistant/assistant-tools.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";

export async function handleMcpRequest(
  runtime: AssistantToolsRuntime,
  request: Request,
): Promise<Response> {
  // The MCP spec requires validating Origin against DNS rebinding, and the SDK handler leaves it to
  // the caller. The server has no sign-in, so only localhost may reach the user's Instagram data.
  const rejected =
    hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
    originValidationResponse(request, localhostAllowedOrigins());

  return rejected ?? (await createAssistantMcpHandler(runtime).fetch(request));
}

async function handle({ request }: { request: Request }) {
  return await handleMcpRequest(getProductionRuntime(), request);
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: { DELETE: handle, GET: handle, POST: handle },
  },
});
