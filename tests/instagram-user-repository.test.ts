import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDrizzle } from "../sdk/database/client.ts";
import { InstagramUserRepository } from "../sdk/entities/instagram-user.ts";

describe("InstagramUserRepository", () => {
  test("stores and updates Instagram users in SQLite", async (context) => {
    const database = createDrizzle(":memory:");
    database.$client.exec(`CREATE TABLE instagram_users (
      biography TEXT, fullName TEXT, id TEXT NOT NULL, pk TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL
    )`);
    context.after(() => {
      database.$client.close();
    });
    const repository = new InstagramUserRepository(database);

    await repository.save({
      biography: "A profile description",
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
      biography: "A profile description",
      full_name: "Updated Name",
      id: "id-2",
      pk: "pk-1",
      username: "fixture-user",
    });
    await repository.save({
      biography: "",
      full_name: "Updated Name",
      id: "id-2",
      pk: "pk-1",
      username: "fixture-user",
    });
    assert.equal(repository.findByUsername("fixture-user")?.biography, "");
  });
});
