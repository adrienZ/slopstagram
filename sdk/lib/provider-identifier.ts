import { z } from "zod";
import type { JsonValue } from "./json-value.ts";

export const ProviderIdentifierSchema = z.union([
  z.string().refine((value) => value.trim().length > 0),
  z.number().int().transform(String),
]);

export function getProviderIdentifier(value: JsonValue | undefined): string | null {
  const parsed = ProviderIdentifierSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
