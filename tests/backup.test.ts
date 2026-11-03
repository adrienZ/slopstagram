import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { createDrizzle } from "@@/core/database/client.ts";
import { createDatabaseBackup } from "@@/core/database/backup.ts";
import { InstagramUserRepository } from "@@/core/database/repositories/instagram-user-repository.ts";
import { createTestDatabase } from "./test-database.ts";

test("copies the database into the backup folder under a name ending with the time", async (context) => {
  const database = createTestDatabase(context);
  const users = new InstagramUserRepository(database);
  await users.save({ full_name: null, id: "id-1", pk: "pk-1", username: "backed-up" });
  const parent = await mkdtemp(path.join(tmpdir(), "slopstagram-backup-"));
  context.onTestFinished(async () => {
    await rm(parent, { force: true, recursive: true });
  });
  const directory = path.join(parent, "backups");

  createDatabaseBackup(database, directory)(new Date("2026-11-03T12:00:00.123Z"));

  expect(await readdir(directory)).toStrictEqual(["slopstagram-20261103T120000123Z.sqlite"]);
  const backup = createDrizzle(path.join(directory, "slopstagram-20261103T120000123Z.sqlite"));
  context.onTestFinished(() => {
    backup.$client.close();
  });
  expect(new InstagramUserRepository(backup).listAll()).toStrictEqual(users.listAll());
});
