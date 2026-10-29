import { describe, test, expect } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { AppleVisionRepository } from "../sdk/repositories/apple-vision-repository.ts";

describe("AppleVisionRepository", () => {
  test("stores and updates captions in SQLite", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.onTestFinished(() => {
      database.$client.close();
    });
    const repository = new AppleVisionRepository(database);

    await repository.save("story-1", "first caption");
    await repository.save("story-1", "updated caption");

    expect(repository.findByMediaPk("story-1")).toBe("updated caption");
  });
});
