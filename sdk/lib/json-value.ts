import { z } from "zod";

export type JsonPrimitive = boolean | null | number | string;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

export function isJsonObject(value: JsonValue): value is JsonObject {
  return JsonObjectSchema.safeParse(value).success;
}
