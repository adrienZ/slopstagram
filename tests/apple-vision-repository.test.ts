import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { AppleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";

describe("AppleVisionRepository", () => {
  test("stores and updates captions in SQLite", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new AppleVisionRepository(database);

    await repository.save("story-1", "first caption");
    await repository.save("story-1", "updated caption");

    assert.equal(repository.findByMediaPk("story-1"), "updated caption");
  });
});
