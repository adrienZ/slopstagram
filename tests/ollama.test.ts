import { test, vi, expect } from "vitest";
import { createOllamaClient } from "@@/core/domains/vision/ollama.ts";

test("an explicit host overrides OLLAMA_HOST and accepts a generation endpoint", async () => {
  vi.stubEnv("OLLAMA_HOST", "http://environment.example:11434");

  const client = createOllamaClient({
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

  const client = createOllamaClient({
    fetch: async (url) => {
      expect(url).toBe("http://environment.example:11434/api/generate");

      return globalThis.Response.json({ response: "environment response" });
    },
  });

  const response = await client.generate({ model: "test-model", prompt: "test", stream: false });
  expect(response.response).toBe("environment response");
});

test("uses localhost when OLLAMA_HOST is unset", async () => {
  // oxlint-disable-next-line no-useless-undefined -- Vitest requires undefined to remove the environment variable.
  vi.stubEnv("OLLAMA_HOST", undefined);

  const client = createOllamaClient({
    fetch: async (url) => {
      expect(url).toBe("http://127.0.0.1:11434/api/generate");

      return globalThis.Response.json({ response: "default response" });
    },
  });

  const response = await client.generate({ model: "test-model", prompt: "test", stream: false });
  expect(response.response).toBe("default response");
});
