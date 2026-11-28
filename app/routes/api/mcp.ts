import process from "node:process";
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

function readAllowedHosts(): Array<string> {
  return (process.env.MCP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host !== "");
}

export async function handleMcpRequest(
  runtime: AssistantToolsRuntime,
  request: Request,
): Promise<Response> {
  // The MCP spec requires validating Origin against DNS rebinding, and the SDK handler leaves it to
  // the caller. The server has no sign-in, so only localhost may reach the user's Instagram data,
  // plus the hosts of a deployment that a password already guards.
  const extraHosts = readAllowedHosts();

  const rejected =
    hostHeaderValidationResponse(request, [...localhostAllowedHostnames(), ...extraHosts]) ??
    originValidationResponse(request, [...localhostAllowedOrigins(), ...extraHosts]);

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
