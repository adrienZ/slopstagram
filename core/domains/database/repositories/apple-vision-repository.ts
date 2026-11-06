import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "@@/core/domains/database/client.ts";
import {
  appleVision,
  NewAppleVisionSchema,
} from "@@/core/domains/database/entities/apple-vision.ts";

export class AppleVisionRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }

  findByMediaPk(mediaPk: string): string | null {
    const row = this.database
      .select()
      .from(appleVision)
      .where(eq(appleVision.mediaPk, mediaPk))
      .get();

    return row?.caption ?? null;
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
