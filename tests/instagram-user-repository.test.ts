import { describe, test, expect } from "vitest";
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
    expect(repository.listAll()).toStrictEqual([]);
    await Promise.all(
      ["zebra", "alice"].map(async (username) => {
        await repository.save({ username, id: username, pk: username, full_name: null });
      }),
    );
    expect(repository.listAll().map((user) => user.username)).toStrictEqual(["alice", "zebra"]);
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

    expect(repository.findByUsername("fixture-user")).toStrictEqual({
      full_name: "Updated Name",
      id: "id-2",
      pk: "pk-1",
      username: "fixture-user",
    });
  });
});
