import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type TestContext } from "vitest";
import { createDrizzle } from "@@/core/database/client.ts";
import { backupDatabase } from "@@/core/database/backup.ts";
import { InstagramUserRepository } from "@@/core/database/repositories/instagram-user-repository.ts";
import { createTestDatabase } from "./test-database.ts";

async function createBackupDirectory(context: Pick<TestContext, "onTestFinished">) {
  const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-backups-"));
  context.onTestFinished(async () => {
    await rm(directory, { force: true, recursive: true });
  });
  return path.join(directory, "backups");
}

test("writes a timestamped copy that holds the rows of the database", async (context) => {
  const database = createTestDatabase(context);
  const users = new InstagramUserRepository(database);
  await users.save({ full_name: null, id: "id-1", pk: "pk-1", username: "backed-up" });
  const directory = await createBackupDirectory(context);

  backupDatabase(database, directory, { now: new Date("2026-11-03T12:00:00.123Z") });

  expect(await readdir(directory)).toStrictEqual(["slopstagram-20261103T120000123Z.sqlite"]);
  const backup = createDrizzle(path.join(directory, "slopstagram-20261103T120000123Z.sqlite"));
  context.onTestFinished(() => {
    backup.$client.close();
  });
  expect(new InstagramUserRepository(backup).listAll()).toStrictEqual(users.listAll());
});

test("keeps only the most recent backups and leaves other files alone", async (context) => {
  const database = createTestDatabase(context);
  const directory = await createBackupDirectory(context);

  for (const hour of ["10", "11", "12", "13"]) {
    backupDatabase(database, directory, {
      keep: 2,
      now: new Date(`2026-11-03T${hour}:00:00.000Z`),
    });
  }
  await writeFile(path.join(directory, "notes.txt"), "not a backup");
  backupDatabase(database, directory, { keep: 2, now: new Date("2026-11-03T14:00:00.000Z") });

  const remaining = await readdir(directory);
  expect(remaining.toSorted()).toStrictEqual([
    "notes.txt",
    "slopstagram-20261103T130000000Z.sqlite",
    "slopstagram-20261103T140000000Z.sqlite",
  ]);
});
