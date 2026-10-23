import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { VisionRepository } from "../sdk/repositories/vision-repository.ts";

describe("VisionRepository", () => {
  test("stores scalar result columns in SQLite", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.onTestFinished(() => {
      database.$client.close();
    });
    const repository = new VisionRepository(database);
    const entry = {
      model: "vision-model",
      prompt_hash: "prompt-hash",
      result: { text: "readable text", visual: "a market" },
    };

    await repository.save("story-2", entry);

    assert.deepEqual(repository.findByMediaPk("story-2"), entry);
    const storedResult = database.$client
      .prepare("SELECT text, visual FROM vision WHERE mediaPk = ?")
      .get("story-2");
    assert.ok(storedResult);
    assert.equal(storedResult.text, "readable text");
    assert.equal(storedResult.visual, "a market");
  });
});
