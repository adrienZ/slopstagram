import type { z } from "zod";
import type { JsonValue } from "./json-value.ts";

interface AssistantToolDefinition<Input, Output> {
  description: string;
  // A method, not a property: its parameter is checked bivariantly, so a tool that takes its own
  // input type fits the registry's JSON input.
  // oxlint-disable-next-line typescript/method-signature-style
  execute(input: Input): Output | PromiseLike<Output>;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
}

/** What the registry holds: every Assistant tool takes and returns JSON. */
export type AssistantTool = AssistantToolDefinition<JsonValue, unknown>;

/** Declares a tool for the AI SDK, which accepts this shape as is, and keeps its required fields in its type. */
export function defineAssistantTool<Input, Output>(
  definition: AssistantToolDefinition<Input, Output>,
): AssistantToolDefinition<Input, Output> {
  return definition;
}
