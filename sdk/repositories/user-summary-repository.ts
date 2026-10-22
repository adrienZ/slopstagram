import { eq } from "drizzle-orm";
import { useDrizzle, type DrizzleDatabase } from "../database/client.ts";
import { userSummaries, NewUserSummarySchema } from "../entities/user-summary.ts";
import type { UserSummaryEntry } from "../lib/types.ts";
import { instagramUsers } from "../entities/instagram-user.ts";

export class UserSummaryRepository {
  private readonly database: DrizzleDatabase;

  constructor(database: DrizzleDatabase) {
    this.database = database;
  }

  findBySourceHash(sourceHash: string): UserSummaryEntry | null {
    const row = this.database
      .select({
        legacyUsername: userSummaries.legacyUsername,
        promptHash: userSummaries.promptHash,
        result: userSummaries.result,
        sourceHash: userSummaries.sourceHash,
        username: instagramUsers.username,
      })
      .from(userSummaries)
      .leftJoin(instagramUsers, eq(userSummaries.instagramUserPk, instagramUsers.pk))
      .where(eq(userSummaries.sourceHash, sourceHash))
      .get();

    if (row === undefined) {
      return null;
    }

    return {
      prompt_hash: row.promptHash,
      result: row.result,
      source_hash: row.sourceHash,
      user_key: row.username ?? row.legacyUsername ?? "",
    };
  }

  async save(value: UserSummaryEntry): Promise<void> {
    const users = this.database
      .select({ pk: instagramUsers.pk })
      .from(instagramUsers)
      .where(eq(instagramUsers.username, value.user_key))
      .all();
    if (users.length !== 1) {
      throw new Error(`Expected one Instagram user for summary owner ${value.user_key}`);
    }

    const entry = NewUserSummarySchema.parse({
      instagramUserPk: users[0].pk,
      legacyUsername: null,
      promptHash: value.prompt_hash,
      result: value.result,
      sourceHash: value.source_hash,
    });
    await this.database
      .insert(userSummaries)
      .values(entry)
      .onConflictDoUpdate({
        set: {
          promptHash: entry.promptHash,
          result: entry.result,
          instagramUserPk: entry.instagramUserPk,
          legacyUsername: null,
        },
        target: userSummaries.sourceHash,
      });
  }
}

export const userSummaryRepository = new UserSummaryRepository(useDrizzle());
