import { performance } from "node:perf_hooks";
import { wrapLanguageModel } from "ai";
import { reportTrace } from "evalite/traces";
import type { AssistantModel } from "@@/core/domains/assistant/assistant.ts";

type StreamPart<Stream> = Stream extends ReadableStream<infer Part> ? Part : never;

/**
 * Traces every call of the chat model in the evalite UI: its prompt, what it streamed, and its
 * token usage. Evalite's own `wrapAISDKModel` cannot do it: it throws on the reasoning parts that
 * the model (`think: true`) puts in the prompt of its second step.
 */
export function traceModel(model: AssistantModel): AssistantModel {
  return wrapLanguageModel({
    middleware: {
      wrapStream: async ({ doStream, params }) => {
        const start = performance.now();
        const { stream, ...rest } = await doStream();
        const toolCalls: Array<string> = [];
        const output = { reasoning: "", text: "", toolCalls };
        let usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;
        const traced = stream.pipeThrough(
          new globalThis.TransformStream<StreamPart<typeof stream>, StreamPart<typeof stream>>({
            flush: () => {
              reportTrace({ end: performance.now(), input: params.prompt, output, start, usage });
            },
            transform: (part, controller) => {
              if (part.type === "text-delta") {
                output.text += part.delta;
              } else if (part.type === "reasoning-delta") {
                output.reasoning += part.delta;
              } else if (part.type === "tool-call") {
                toolCalls.push(`${part.toolName}(${part.input})`);
              } else if (part.type === "finish") {
                const inputTokens = part.usage.inputTokens.total ?? 0;
                const outputTokens = part.usage.outputTokens.total ?? 0;
                usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
              }
              controller.enqueue(part);
            },
          }),
        );
        return { ...rest, stream: traced };
      },
    },
    model,
  });
}
