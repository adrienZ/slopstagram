import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { URL } from "node:url";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository, instagramUsers } from "../sdk/entities/instagram-user.ts";
import { UserSummaryRepository, userSummaries } from "../sdk/entities/user-summary.ts";

const entry = {
  prompt_hash: "prompt-hash",
  result: "A short summary.",
  source_hash: "source-hash",
  user_key: "summary-user",
};

// These tests execute migration SQL. Keep this suite skipped until backfill review is approved.
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

  test("backfills unique owners while preserving unmatched and ambiguous summaries", (context) => {
    const database = createDrizzle(":memory:");
    context.after(() => {
      database.$client.close();
    });
    database.$client.exec(`
      CREATE TABLE instagram_users (pk TEXT PRIMARY KEY, username TEXT NOT NULL);
      CREATE TABLE user_summaries (promptHash TEXT NOT NULL, result TEXT NOT NULL, sourceHash TEXT PRIMARY KEY, userKey TEXT NOT NULL);
      INSERT INTO instagram_users VALUES ('known-pk', 'known'), ('first-pk', 'ambiguous'), ('second-pk', 'ambiguous');
      INSERT INTO user_summaries VALUES ('prompt-1', 'Known summary', 'hash-1', 'known'), ('prompt-2', 'Unmatched summary', 'hash-2', 'unknown'), ('prompt-3', 'Ambiguous summary', 'hash-3', 'ambiguous');
    `);
    database.$client.exec(
      readFileSync(
        new URL(
          "../sdk/database/migrations/20261022091929_user_summary_instagram_pk/migration.sql",
          import.meta.url,
        ),
        "utf-8",
      ),
    );

    assert.deepEqual(database.select().from(userSummaries).all(), [
      {
        instagramUserPk: "known-pk",
        legacyUsername: null,
        promptHash: "prompt-1",
        result: "Known summary",
        sourceHash: "hash-1",
      },
      {
        instagramUserPk: null,
        legacyUsername: "unknown",
        promptHash: "prompt-2",
        result: "Unmatched summary",
        sourceHash: "hash-2",
      },
      {
        instagramUserPk: null,
        legacyUsername: "ambiguous",
        promptHash: "prompt-3",
        result: "Ambiguous summary",
        sourceHash: "hash-3",
      },
    ]);
    assert.deepEqual(database.$client.prepare("PRAGMA foreign_key_check").all(), []);
    const repository = new UserSummaryRepository(database);
    assert.equal(repository.findBySourceHash("hash-2")?.user_key, "unknown");
    assert.equal(repository.findBySourceHash("hash-3")?.user_key, "ambiguous");
  });
});
