import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";
import type { JsonValue } from "@@/core/utils/json-value.ts";
import { handleMcpRequest } from "../app/routes/api/mcp.ts";
import { createWorld, now } from "./setup/report-world.ts";

beforeEach(() => {
  // The tools read the story feed of the current time.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

const JsonRpcResponseSchema = z.object({
  result: z.looseObject({}),
});

interface JsonRpcCall {
  method: string;
  params?: JsonValue;
}

const ToolListSchema = z.object({
  tools: z.array(
    z.looseObject({ description: z.string(), inputSchema: z.looseObject({}), name: z.string() }),
  ),
});

function mcpRequest(body: JsonRpcCall, headers: Record<string, string> = {}) {
  return new globalThis.Request("http://localhost:3000/api/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", ...body }),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      // The server sets the Host header of a real request.
      host: "localhost:3000",
      ...headers,
    },
    method: "POST",
  });
}

/** The server answers with one server-sent event holding the JSON-RPC response. */
async function readResult(response: Response) {
  const stream = await response.text();
  const data = /^data: (?<json>.*)$/mu.exec(stream)?.groups?.json ?? "";

  return JsonRpcResponseSchema.parse(JSON.parse(data)).result;
}

test("tools/list advertises every Assistant tool with its description and schemas", async (context) => {
  const world = await createWorld(context);

  const response = await handleMcpRequest(world.runtime, mcpRequest({ method: "tools/list" }));

  expect(response.status).toBe(200);

  const { tools } = ToolListSchema.parse(await readResult(response));

  expect(tools.map(({ name }) => name).toSorted()).toStrictEqual([
    "getFeedUserSummaries",
    "getMentionConnection",
    "getTaggedPlace",
    "listAccounts",
    "listMentionConnections",
    "listTaggedPlaces",
    "searchAccounts",
    "searchMentionPeople",
    "searchTaggedPlaces",
  ]);
});

test("tools/call runs the tool over the runtime and returns what the chat Assistant reads", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const response = await handleMcpRequest(
    world.runtime,
    mcpRequest({ method: "tools/call", params: { arguments: {}, name: "listAccounts" } }),
  );

  await expect(readResult(response)).resolves.toMatchObject({
    structuredContent: {
      accounts: [
        { fullName: null, handle: "@user_008", username: "user_008" },
        { fullName: null, handle: "@user_072", username: "user_072" },
      ],
    },
  });
});

test("a request that does not come from localhost is rejected before any tool runs", async (context) => {
  const world = await createWorld(context);

  const response = await handleMcpRequest(
    world.runtime,
    mcpRequest({ method: "tools/list" }, { origin: "https://example.com" }),
  );

  expect(response.status).toBe(403);
});
