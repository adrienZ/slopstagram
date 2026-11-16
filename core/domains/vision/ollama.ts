import process from "node:process";
import { Ollama, type Fetch } from "ollama";

/** The Ollama server's base URL, from `OLLAMA_HOST`, without a trailing generate endpoint. */
export function getOllamaHost(host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"): string {
  return host.replace(/\/api\/generate\/?$/u, "");
}

export function createOllamaClient(options: { fetch: Fetch; host?: string }): Ollama {
  return new Ollama({ fetch: options.fetch, host: getOllamaHost(options.host) });
}
