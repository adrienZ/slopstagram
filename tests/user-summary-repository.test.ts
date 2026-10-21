import assert from "node:assert/strict";
import { describe, onTestFinished, test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { UserSummaryRepository } from "../sdk/entities/user-summary.ts";

describe("UserSummaryRepository", () => {
  test("stores summaries in SQLite", async () => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    onTestFinished(() => {
      database.$client.close();
    });
    const repository = new UserSummaryRepository(database);
    const entry = {
      prompt_hash: "prompt-hash",
      result: "A short summary.",
      source_hash: "source-hash",
      user_key: "user-key",
    };

    await repository.save(entry);

    assert.deepEqual(repository.findBySourceHash("source-hash"), entry);
  });
});
