import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { afterEach, beforeEach, expect, test, vi, type TestContext } from "vitest";
import { createDrizzle } from "@@/core/database/client.ts";
import { migrateDatabase } from "@@/core/database/migrate.ts";
import { InstagramUserRepository } from "@@/core/database/repositories/instagram-user-repository.ts";

const migrationsFolder = fileURLToPath(new URL("../core/database/migrations", import.meta.url));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00.123Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function createWorkspace(context: Pick<TestContext, "onTestFinished">) {
  const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-migrate-"));
  context.onTestFinished(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  const migrations = await readdir(migrationsFolder, { withFileTypes: true });
  const migrationNames = migrations
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  // The same migrations as production, minus the newest one, which is the pending migration.
  const olderMigrationsFolder = path.join(directory, "older-migrations");
  await Promise.all(
    migrationNames.slice(0, -1).map(async (name) => {
      await cp(path.join(migrationsFolder, name), path.join(olderMigrationsFolder, name), {
        recursive: true,
      });
    }),
  );

  function open(filename: string) {
    const database = createDrizzle(path.join(directory, filename));
    context.onTestFinished(() => {
      database.$client.close();
    });
    return database;
  }

  return {
    backupDirectory: path.join(directory, "backups"),
    migrationCount: migrationNames.length,
    olderMigrationsFolder,
    open,
  };
}

function appliedMigrations(database: ReturnType<typeof createDrizzle>) {
  return database.$client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()
    ?.count;
}

async function listBackups(backupDirectory: string) {
  return await readdir(backupDirectory).catch(() => []);
}

test("pending migrations produce a timestamped backup holding the pre-migration rows", async (context) => {
  const workspace = await createWorkspace(context);
  const database = workspace.open("live.sqlite");
  migrateDatabase(database, { migrationsFolder: workspace.olderMigrationsFolder });
  await new InstagramUserRepository(database).save({
    full_name: null,
    id: "id-1",
    pk: "pk-1",
    username: "before-migration",
  });

  migrateDatabase(database, { backupDirectory: workspace.backupDirectory });

  expect(await listBackups(workspace.backupDirectory)).toStrictEqual([
    "slopstagram-20261103T120000123Z.sqlite",
  ]);
  const backup = createDrizzle(
    path.join(workspace.backupDirectory, "slopstagram-20261103T120000123Z.sqlite"),
  );
  context.onTestFinished(() => {
    backup.$client.close();
  });
  expect(new InstagramUserRepository(backup).listAll().map((user) => user.username)).toStrictEqual([
    "before-migration",
  ]);
  expect(appliedMigrations(backup)).toBe(workspace.migrationCount - 1);
  expect(appliedMigrations(database)).toBe(workspace.migrationCount);
});

test("no pending migrations produce no backup", async (context) => {
  const workspace = await createWorkspace(context);
  const database = workspace.open("live.sqlite");
  migrateDatabase(database);

  migrateDatabase(database, { backupDirectory: workspace.backupDirectory });

  expect(await listBackups(workspace.backupDirectory)).toStrictEqual([]);
});

test("a new database is migrated without a backup", async (context) => {
  const workspace = await createWorkspace(context);
  const database = workspace.open("live.sqlite");

  migrateDatabase(database, { backupDirectory: workspace.backupDirectory });

  expect(await listBackups(workspace.backupDirectory)).toStrictEqual([]);
});
