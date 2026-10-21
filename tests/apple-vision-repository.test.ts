import assert from "node:assert/strict";
import { describe, onTestFinished, test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { AppleVisionRepository } from "../sdk/entities/apple-vision.ts";

describe("AppleVisionRepository", () => {
  test("stores and updates captions in SQLite", async () => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    onTestFinished(() => {
      database.$client.close();
    });
    const repository = new AppleVisionRepository(database);

    await repository.save("story-1", "first caption");
    await repository.save("story-1", "updated caption");

    assert.equal(repository.findByMediaPk("story-1"), "updated caption");
  });
});
