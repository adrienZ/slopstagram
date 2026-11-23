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
  // The tools read the user's Instagram data and the server has no sign-in: a web page must not
  // reach it through the browser (DNS rebinding), so only localhost may call it.
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
