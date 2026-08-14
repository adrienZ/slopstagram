import { eq } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";
import type { DrizzleDatabase } from "../database/client.ts";
import type { InstagramUserEntry } from "../lib/types.ts";

export const instagramUsers = sqliteTable("instagram_users", {
  fullName: text(),
  id: text().notNull(),
  pk: text().notNull().primaryKey(),
  username: text().notNull(),
});

export const NewInstagramUserSchema = createInsertSchema(instagramUsers);

export class InstagramUserRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  findByUsername(username: string): Promise<InstagramUserEntry | null> {
    const row = this.database
      .select()
      .from(instagramUsers)
      .where(eq(instagramUsers.username, username))
      .get();

    if (row === undefined) return Promise.resolve(null);

    return Promise.resolve({
      full_name: row.fullName,
      id: row.id,
      pk: row.pk,
      username: row.username,
    });
  }

  async save(value: InstagramUserEntry): Promise<void> {
    const entry = NewInstagramUserSchema.parse({
      fullName: value.full_name,
      id: value.id,
      pk: value.pk,
      username: value.username,
    });
    await this.database
      .insert(instagramUsers)
      .values(entry)
      .onConflictDoUpdate({
        set: {
          fullName: entry.fullName,
          id: entry.id,
          pk: entry.pk,
          username: entry.username,
        },
        target: instagramUsers.pk,
      });
  }
}
