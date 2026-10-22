import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { getOllamaClient } from "../sdk/ollama.ts";

test("an explicit host overrides OLLAMA_HOST and accepts a generation endpoint", async (context) => {
  context.mock.property(process, "env", {
    ...process.env,
    OLLAMA_HOST: "http://environment.example:11434",
  });
  const client = getOllamaClient({
    host: "http://custom.example:11434/api/generate/",
    fetch: async (url) => {
      assert.equal(url, "http://custom.example:11434/api/generate");
      return globalThis.Response.json({ response: "custom response" });
    },
  });

  const response = await client.generate({ model: "test-model", prompt: "test", stream: false });
  assert.equal(response.response, "custom response");
});

test("uses and normalizes OLLAMA_HOST when no host override is supplied", async (context) => {
  context.mock.property(process, "env", {
    ...process.env,
    OLLAMA_HOST: "http://environment.example:11434/api/generate",
  });
  const client = getOllamaClient({
    fetch: async (url) => {
      assert.equal(url, "http://environment.example:11434/api/generate");
      return globalThis.Response.json({ response: "environment response" });
    },
  });

  const response = await client.generate({ model: "test-model", prompt: "test", stream: false });
  assert.equal(response.response, "environment response");
});

test("reuses the default localhost client and isolates host and transport overrides", async (context) => {
  const environment = { ...process.env };
  delete environment.OLLAMA_HOST;
  context.mock.property(process, "env", environment);
  context.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    assert.equal(url, "http://127.0.0.1:11434/api/generate");
    return globalThis.Response.json({ response: "default response" });
  });
  const shared = getOllamaClient();
  const custom = getOllamaClient({
    host: "http://isolated.example:11434",
    fetch: async (url) => {
      assert.equal(url, "http://isolated.example:11434/api/generate");
      return globalThis.Response.json({ response: "isolated response" });
    },
  });
  const transportOnly = getOllamaClient({
    fetch: async (url) => {
      assert.equal(url, "http://127.0.0.1:11434/api/generate");
      return globalThis.Response.json({ response: "transport response" });
    },
  });
  const request = { model: "test-model", prompt: "test", stream: false } as const;

  assert.equal(getOllamaClient(), shared);
  assert.equal(getOllamaClient({ host: undefined, fetch: undefined }), shared);
  const responses = await Promise.all([
    shared.generate(request),
    custom.generate(request),
    transportOnly.generate(request),
    shared.generate(request),
  ]);
  assert.deepEqual(
    responses.map((response) => response.response),
    ["default response", "isolated response", "transport response", "default response"],
  );
});
