import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "@slopstagram/sdk/database/client.ts";
import { migrateDatabase } from "@slopstagram/sdk/database/migrate.ts";
import { InstagramUserRepository } from "@slopstagram/sdk/repositories/instagram-user-repository.ts";

describe("InstagramUserRepository", () => {
  test("stores and updates Instagram users in SQLite", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.after(() => {
      database.$client.close();
    });
    const repository = new InstagramUserRepository(database);

    await repository.save({
      full_name: "First Name",
      id: "id-1",
      pk: "pk-1",
      username: "fixture-user",
    });
    await repository.save({
      full_name: "Updated Name",
      id: "id-2",
      pk: "pk-1",
      username: "fixture-user",
    });

    assert.deepEqual(repository.findByUsername("fixture-user"), {
      full_name: "Updated Name",
      id: "id-2",
      pk: "pk-1",
      username: "fixture-user",
    });
  });
});
