import process from "node:process";
import { Ollama, type Config } from "ollama";

let defaultClient: Ollama | undefined;

// The shared client captures the environment on first use; overrides create isolated clients.
export function getOllamaClient(options: Partial<Pick<Config, "host" | "fetch">> = {}): Ollama {
  const useDefaultClient = options.host === undefined && options.fetch === undefined;
  if (useDefaultClient && defaultClient !== undefined) {
    return defaultClient;
  }

  const client = new Ollama({
    fetch: options.fetch,
    host: (options.host ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(
      /\/api\/generate\/?$/u,
      "",
    ),
  });

  if (useDefaultClient) {
    defaultClient = client;
  }

  return client;
}
