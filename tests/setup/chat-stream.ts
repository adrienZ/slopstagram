import { z } from "zod";

const ChunkSchema = z.looseObject({ type: z.string() });

export function chatRequest(body: string) {
  return new globalThis.Request("http://localhost/api/chat", { body, method: "POST" });
}

export function userMessage(text: string) {
  return JSON.stringify({
    messages: [{ id: "message-1", parts: [{ text, type: "text" }], role: "user" }],
  });
}

type Chunk = z.infer<typeof ChunkSchema>;

function joinDeltas(events: Array<Chunk>, type: string) {
  return events
    .filter((chunk) => chunk.type === type)
    .map((chunk) => z.string().parse(chunk.delta))
    .join("");
}

/** The UI message stream chunks of a chat response, in order. */
export async function readChunks(response: Response) {
  const stream = await response.text();
  const events = stream.split("\n\n").flatMap((event) => {
    const data = event.replace(/^data: /u, "").trim();
    return data.length === 0 || data === "[DONE]" ? [] : [ChunkSchema.parse(JSON.parse(data))];
  });
  return {
    events,
    reasoning: joinDeltas(events, "reasoning-delta"),
    text: joinDeltas(events, "text-delta"),
    toolInputs: events
      .filter((chunk) => chunk.type === "tool-input-available")
      .map((chunk) => ({ input: chunk.input, toolName: chunk.toolName })),
    toolOutputs: events
      .filter((chunk) => chunk.type === "tool-output-available")
      .map((chunk) => chunk.output),
  };
}
