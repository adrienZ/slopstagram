import { eq } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";
import type { DrizzleDatabase } from "../database/client.ts";
import type { VisionEntry } from "../lib/types.ts";

export const vision = sqliteTable("vision", {
  mediaPk: text().primaryKey(),
  model: text().notNull(),
  promptHash: text().notNull(),
  text: text().notNull(),
  visual: text().notNull(),
});

export const NewVisionSchema = createInsertSchema(vision);

export class VisionRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  findByMediaPk(mediaPk: string): Promise<VisionEntry | null> {
    const row = this.database.select().from(vision).where(eq(vision.mediaPk, mediaPk)).get();

    if (row === undefined) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      model: row.model,
      prompt_hash: row.promptHash,
      result: { text: row.text, visual: row.visual },
    });
  }

  async save(mediaPk: string, value: VisionEntry): Promise<void> {
    const entry = NewVisionSchema.parse({
      mediaPk,
      model: value.model,
      promptHash: value.prompt_hash,
      text: value.result.text,
      visual: value.result.visual,
    });
    await this.database
      .insert(vision)
      .values(entry)
      .onConflictDoUpdate({
        set: {
          model: entry.model,
          promptHash: entry.promptHash,
          text: entry.text,
          visual: entry.visual,
        },
        target: vision.mediaPk,
      });
  }
}
