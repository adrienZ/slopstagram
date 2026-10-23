import { asc, eq } from "drizzle-orm";
import { useDrizzle, type DrizzleDatabase } from "../database/client.ts";
import { instagramUsers, NewInstagramUserSchema } from "../entities/instagram-user.ts";
import type { InstagramUserEntry } from "../lib/types.ts";

export class InstagramUserRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }

  listAll(): Array<InstagramUserEntry> {
    return this.database
      .select()
      .from(instagramUsers)
      .orderBy(asc(instagramUsers.username), asc(instagramUsers.pk))
      .all()
      .map((row) => ({
        full_name: row.fullName,
        id: row.id,
        pk: row.pk,
        username: row.username,
      }));
  }

  findByUsername(username: string): InstagramUserEntry | null {
    const row = this.database
      .select()
      .from(instagramUsers)
      .where(eq(instagramUsers.username, username))
      .get();

    if (row === undefined) {
      return null;
    }

    return {
      full_name: row.fullName,
      id: row.id,
      pk: row.pk,
      username: row.username,
    };
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

export const instagramUserRepository = new InstagramUserRepository(useDrizzle());
