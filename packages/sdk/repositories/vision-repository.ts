import { eq } from "drizzle-orm";
import { useDrizzle, type DrizzleDatabase } from "../database/client.ts";
import { vision, NewVisionSchema } from "../entities/vision.ts";
import type { VisionEntry } from "../lib/types.ts";

export class VisionRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }

  findByMediaPk(mediaPk: string): VisionEntry | null {
    const row = this.database.select().from(vision).where(eq(vision.mediaPk, mediaPk)).get();

    if (row === undefined) {
      return null;
    }

    return {
      model: row.model,
      prompt_hash: row.promptHash,
      result: { text: row.text, visual: row.visual },
    };
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

export const visionRepository = new VisionRepository(useDrizzle());
