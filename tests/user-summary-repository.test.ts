import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { UserSummaryRepository } from "../sdk/entities/user-summary.ts";
import { InstagramUserRepository } from "../sdk/entities/instagram-user.ts";

describe("UserSummaryRepository", () => {
  test("stores summaries in SQLite", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new UserSummaryRepository(database);
    const users = new InstagramUserRepository(database);
    await users.save({ id: "id-1", pk: "pk-1", full_name: null, username: "user-key" });
    const entry = {
      prompt_hash: "prompt-hash",
      result: "A short summary.",
      source_hash: "source-hash",
      user_key: "user-key",
    };

    await repository.save(entry);

    assert.deepEqual(repository.findBySourceHash("source-hash"), entry);
    assert.equal(
      database.$client.prepare("SELECT instagramUserPk FROM user_summaries").get()?.instagramUserPk,
      "pk-1",
    );
    await users.save({ id: "id-1", pk: "pk-1", full_name: null, username: "renamed-user" });
    assert.equal(repository.findBySourceHash("source-hash")?.user_key, "renamed-user");
    await assert.rejects(
      repository.save({ ...entry, user_key: "unknown" }),
      /Cannot link summary/u,
    );
    assert.throws(
      () => database.$client.prepare("UPDATE user_summaries SET instagramUserPk = 'unknown'").run(),
      /FOREIGN KEY/u,
    );
  });
});
