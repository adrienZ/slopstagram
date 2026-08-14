import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/entities/instagram-user.ts";

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

    assert.deepEqual(await repository.findByUsername("fixture-user"), {
      full_name: "Updated Name",
      id: "id-2",
      pk: "pk-1",
      username: "fixture-user",
    });
  });
});
