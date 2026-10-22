import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
    context.after(() => {
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

    assert.deepEqual(repository.findBySourceHash(entry.source_hash), entry);
    assert.deepEqual(database.select().from(userSummaries).get(), {
      instagramUserPk: owner.pk,
      legacyUsername: null,
      promptHash: entry.prompt_hash,
      result: entry.result,
      sourceHash: entry.source_hash,
    });
    await users.save({ ...owner, username: "renamed-user" });
    assert.equal(repository.findBySourceHash(entry.source_hash)?.user_key, "renamed-user");
  });

  test("rejects new summaries with missing or ambiguous owners", async (context) => {
    const database = createDrizzle(":memory:");
    context.after(() => {
      database.$client.close();
    });
    migrateDatabase(database);
    const repository = new UserSummaryRepository(database);
    await assert.rejects(repository.save(entry), /Expected one Instagram user/u);
    await database.insert(instagramUsers).values([
      { id: "first-id", pk: "first-pk", username: entry.user_key },
      { id: "second-id", pk: "second-pk", username: entry.user_key },
    ]);
    await assert.rejects(repository.save(entry), /Expected one Instagram user/u);
    assert.equal(database.select().from(userSummaries).all().length, 0);
  });
});
