import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, type TestContext } from "vitest";
import { createDrizzle } from "@@/core/database/client.ts";
import { migrateDatabase } from "@@/core/database/migrate.ts";
import { InstagramUserRepository } from "@@/core/database/repositories/instagram-user-repository.ts";
import { snapshotDatabase } from "@@/core/database/snapshot.ts";

async function createFileDatabase(context: Pick<TestContext, "onTestFinished">) {
  const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-snapshot-"));
  context.onTestFinished(async () => {
    await rm(directory, { force: true, recursive: true });
  });
  const database = createDrizzle(path.join(directory, "source.sqlite"));
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  return { database, directory };
}

describe("snapshotDatabase", () => {
  test("copies the rows of a database that is still open", async (context) => {
    const { database, directory } = await createFileDatabase(context);
    const users = new InstagramUserRepository(database);
    await users.save({ full_name: "Snapshot User", id: "id-1", pk: "pk-1", username: "snap" });
    const destination = path.join(directory, "copies", "snapshot.sqlite");

    snapshotDatabase(database, destination);

    const copy = createDrizzle(destination);
    context.onTestFinished(() => {
      copy.$client.close();
    });
    expect(new InstagramUserRepository(copy).listAll()).toStrictEqual(users.listAll());
  });

  test("leaves the source untouched and keeps it writable", async (context) => {
    const { database, directory } = await createFileDatabase(context);
    const users = new InstagramUserRepository(database);
    await users.save({ full_name: null, id: "id-1", pk: "pk-1", username: "before" });

    snapshotDatabase(database, path.join(directory, "snapshot.sqlite"));
    await users.save({ full_name: null, id: "id-2", pk: "pk-2", username: "after" });

    expect(users.listAll().map((user) => user.username)).toStrictEqual(["after", "before"]);
  });

  test("replaces the previous snapshot", async (context) => {
    const { database, directory } = await createFileDatabase(context);
    const users = new InstagramUserRepository(database);
    const destination = path.join(directory, "snapshot.sqlite");
    await users.save({ full_name: null, id: "id-1", pk: "pk-1", username: "first" });
    snapshotDatabase(database, destination);
    await users.save({ full_name: null, id: "id-2", pk: "pk-2", username: "second" });

    snapshotDatabase(database, destination);

    const copy = createDrizzle(destination);
    context.onTestFinished(() => {
      copy.$client.close();
    });
    expect(
      new InstagramUserRepository(copy)
        .listAll()
        .map((user) => user.username)
        .toSorted(),
    ).toStrictEqual(["first", "second"]);
  });
});
