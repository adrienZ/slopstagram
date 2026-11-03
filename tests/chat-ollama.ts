import { z } from "zod";

const OllamaChatRequestSchema = z.object({
  messages: z.array(z.object({ content: z.string(), role: z.string() })),
});

export const chatAnswer = "Voici ce que cette personne a partagé.";

const done = { done: true, done_reason: "stop", eval_count: 1, model: "m", prompt_eval_count: 1 };

function ndjson(...lines: Array<object>) {
  return new globalThis.Response(lines.map((line) => JSON.stringify(line)).join("\n"));
}

/** Ollama calls the tool for the first @mention it reads, then answers once it has the result. */
export async function fakeChatOllama(_url: RequestInfo | URL, init?: RequestInit) {
  const { messages } = OllamaChatRequestSchema.parse(JSON.parse(z.string().parse(init?.body)));
  await Promise.resolve();
  if (messages.some(({ role }) => role === "tool")) {
    return ndjson({ done: false, message: { content: chatAnswer, role: "assistant" } }, done);
  }
  const question = messages.findLast(({ role }) => role === "user")?.content ?? "";
  const username = /@(?<username>[\w.]+)/u.exec(question)?.groups?.username;
  return ndjson(
    {
      done: false,
      message: {
        content: "",
        role: "assistant",
        thinking: "Je dois lire le résumé du compte.",
        tool_calls: [
          username === undefined
            ? { function: { arguments: {}, name: "listUsers" } }
            : { function: { arguments: { username }, name: "getRecentUserSummary" } },
        ],
      },
    },
    done,
  );
}
