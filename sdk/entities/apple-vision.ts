import { eq } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";
import type { DrizzleDatabase } from "../database/client.ts";

export const appleVision = sqliteTable("apple_vision", {
  caption: text().notNull(),
  mediaPk: text().primaryKey(),
});

export const NewAppleVisionSchema = createInsertSchema(appleVision);

export class AppleVisionRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  findByMediaPk(mediaPk: string): Promise<string | null> {
    const row = this.database
      .select()
      .from(appleVision)
      .where(eq(appleVision.mediaPk, mediaPk))
      .get();

    return Promise.resolve(row?.caption ?? null);
  }

  async save(mediaPk: string, caption: string): Promise<void> {
    const entry = NewAppleVisionSchema.parse({ caption, mediaPk });
    await this.database
      .insert(appleVision)
      .values(entry)
      .onConflictDoUpdate({
        set: { caption: entry.caption },
        target: appleVision.mediaPk,
      });
  }
}
