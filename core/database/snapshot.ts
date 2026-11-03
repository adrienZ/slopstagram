import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { DrizzleDatabase } from "./client.ts";

/** Writes a consistent copy of an open database; an existing file at the destination is replaced. */
export function snapshotDatabase(database: DrizzleDatabase, destination: string): void {
  mkdirSync(path.dirname(destination), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${destination}${suffix}`, { force: true });
  }
  database.$client.prepare("VACUUM INTO ?").run(destination);
}
