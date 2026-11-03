import path from "node:path";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { DrizzleDatabase } from "./client.ts";
import { snapshotDatabase } from "./snapshot.ts";

const defaultMigrationsFolder = path.join(import.meta.dirname, "migrations");

interface MigrateOptions {
  /** Where a timestamped copy of the database is written before pending migrations are applied. */
  backupDirectory?: string;
  migrationsFolder?: string;
}

function hasPendingMigrations(database: DrizzleDatabase, migrationsFolder: string): boolean {
  const table = database.$client
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!table) {
    return false;
  }
  const applied = new Set(
    database.$client
      .prepare("SELECT name FROM __drizzle_migrations")
      .all()
      .map(({ name }) => name),
  );
  // A database that applied nothing yet has no rows worth a backup.
  return (
    applied.size > 0 &&
    readMigrationFiles({ migrationsFolder }).some((migration) => !applied.has(migration.name))
  );
}

export function migrateDatabase(database: DrizzleDatabase, options: MigrateOptions = {}): void {
  const migrationsFolder = options.migrationsFolder ?? defaultMigrationsFolder;
  const { backupDirectory } = options;
  // In-memory databases have no file to protect.
  if (
    backupDirectory !== undefined &&
    database.$client.location() !== null &&
    hasPendingMigrations(database, migrationsFolder)
  ) {
    const timestamp = new Date().toISOString().replaceAll(/[-:.]/gu, "");
    snapshotDatabase(database, path.join(backupDirectory, `slopstagram-${timestamp}.sqlite`));
  }
  migrate(database, { migrationsFolder });
}
