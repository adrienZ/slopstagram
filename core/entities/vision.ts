import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";

export const vision = sqliteTable("vision", {
  mediaPk: text().primaryKey(),
  model: text().notNull(),
  promptHash: text().notNull(),
  text: text().notNull(),
  visual: text().notNull(),
});

export const NewVisionSchema = createInsertSchema(vision);

export interface VisionResult {
  text: string;
  visual: string;
}

export interface VisionEntry {
  model: string;
  prompt_hash: string;
  result: VisionResult;
}
