import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";

describe("InstagramUserRepository", () => {
  test("lists all accounts alphabetically, including accounts without stories", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.onTestFinished(() => {
      database.$client.close();
    });
    const repository = new InstagramUserRepository(database);
    assert.deepEqual(repository.listAll(), []);
    await Promise.all(
      ["zebra", "alice"].map(async (username) => {
        await repository.save({ username, id: username, pk: username, full_name: null });
      }),
    );
    assert.deepEqual(
      repository.listAll().map((user) => user.username),
      ["alice", "zebra"],
    );
  });

  test("stores and updates Instagram users in SQLite", async (context) => {
    const database = createDrizzle(":memory:");
    migrateDatabase(database);
    context.onTestFinished(() => {
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
