import { describe, test, expect } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { instagramUsers } from "../sdk/entities/instagram-user.ts";
import { UserSummaryRepository } from "../sdk/repositories/user-summary-repository.ts";
import { userSummaries } from "../sdk/entities/user-summary.ts";

const entry = {
  prompt_hash: "prompt-hash",
  result: "A short summary.",
  source_hash: "source-hash",
  user_key: "summary-user",
};

describe("UserSummaryRepository", () => {
  test("stores summaries by Instagram PK and follows username changes", async (context) => {
    const database = createDrizzle(":memory:");
    context.onTestFinished(() => {
      database.$client.close();
    });
    migrateDatabase(database);
    const users = new InstagramUserRepository(database);
    const owner = {
      full_name: "Display Name",
      id: "user-id",
      pk: "user-pk",
      username: entry.user_key,
    };
    await users.save(owner);
    const repository = new UserSummaryRepository(database);

    await repository.save(entry);

    expect(repository.findBySourceHash(entry.source_hash)).toStrictEqual(entry);
    expect(database.select().from(userSummaries).get()).toStrictEqual({
      instagramUserPk: owner.pk,
      legacyUsername: null,
      promptHash: entry.prompt_hash,
      result: entry.result,
      sourceHash: entry.source_hash,
    });
    await users.save({ ...owner, username: "renamed-user" });
    expect(repository.findBySourceHash(entry.source_hash)?.user_key).toBe("renamed-user");
  });

  test("rejects new summaries with missing or ambiguous owners", async (context) => {
    const database = createDrizzle(":memory:");
    context.onTestFinished(() => {
      database.$client.close();
    });
    migrateDatabase(database);
    const repository = new UserSummaryRepository(database);
    await expect(repository.save(entry)).rejects.toThrow(/Expected one Instagram user/u);
    await database.insert(instagramUsers).values([
      { id: "first-id", pk: "first-pk", username: entry.user_key },
      { id: "second-id", pk: "second-pk", username: entry.user_key },
    ]);
    await expect(repository.save(entry)).rejects.toThrow(/Expected one Instagram user/u);
    expect(database.select().from(userSummaries).all().length).toBe(0);
  });
});
