import { z } from "zod";

export const PageOffsetSchema = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('The "nextOffset" of the previous page, to read the next one. Leave it out first.');

export function nextOffsetAfter(offset: number, size: number, total: number): number | null {
  return offset + size < total ? offset + size : null;
}

export function pageOf<Item>(items: Array<Item>, offset: number, size: number) {
  return {
    items: items.slice(offset, offset + size),
    total: items.length,
    nextOffset: nextOffsetAfter(offset, size, items.length),
  };
}
