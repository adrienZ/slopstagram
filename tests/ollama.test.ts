import { test, vi, expect } from "vitest";
import { getOllamaClient } from "../sdk/ollama.ts";

test("an explicit host overrides OLLAMA_HOST and accepts a generation endpoint", async () => {
  vi.stubEnv("OLLAMA_HOST", "http://environment.example:11434");
  const client = getOllamaClient({
    host: "http://custom.example:11434/api/generate/",
    fetch: async (url) => {
      expect(url).toBe("http://custom.example:11434/api/generate");
      return globalThis.Response.json({ response: "custom response" });
    },
  });

  const response = await client.generate({ model: "test-model", prompt: "test", stream: false });
  expect(response.response).toBe("custom response");
});

test("uses and normalizes OLLAMA_HOST when no host override is supplied", async () => {
  vi.stubEnv("OLLAMA_HOST", "http://environment.example:11434/api/generate");
  const client = getOllamaClient({
    fetch: async (url) => {
      expect(url).toBe("http://environment.example:11434/api/generate");
      return globalThis.Response.json({ response: "environment response" });
    },
  });

  const response = await client.generate({ model: "test-model", prompt: "test", stream: false });
  expect(response.response).toBe("environment response");
});

test("reuses the default localhost client and isolates host and transport overrides", async () => {
  // oxlint-disable-next-line no-useless-undefined -- Vitest requires undefined to remove the environment variable.
  vi.stubEnv("OLLAMA_HOST", undefined);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
    expect(url).toBe("http://127.0.0.1:11434/api/generate");
    return globalThis.Response.json({ response: "default response" });
  });
  const shared = getOllamaClient();
  const custom = getOllamaClient({
    host: "http://isolated.example:11434",
    fetch: async (url) => {
      expect(url).toBe("http://isolated.example:11434/api/generate");
      return globalThis.Response.json({ response: "isolated response" });
    },
  });
  const transportOnly = getOllamaClient({
    fetch: async (url) => {
      expect(url).toBe("http://127.0.0.1:11434/api/generate");
      return globalThis.Response.json({ response: "transport response" });
    },
  });
  const request = { model: "test-model", prompt: "test", stream: false } as const;

  expect(getOllamaClient()).toBe(shared);
  expect(getOllamaClient({ host: undefined, fetch: undefined })).toBe(shared);
  const responses = await Promise.all([
    shared.generate(request),
    custom.generate(request),
    transportOnly.generate(request),
    shared.generate(request),
  ]);
  expect(responses.map((response) => response.response)).toStrictEqual([
    "default response",
    "isolated response",
    "transport response",
    "default response",
  ]);
});
