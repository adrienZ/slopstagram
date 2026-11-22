import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";

const modules = import.meta.glob([
  "../core/**/*.ts",
  "../app/loaders/*.ts",
  "../app/query-service.ts",
  "../nitro/**/*.ts",
]);

test("importing the modules opens no database and creates no data folder", async (context) => {
  const parent = await mkdtemp(path.join(tmpdir(), "slopstagram-import-"));
  context.onTestFinished(async () => {
    vi.unstubAllEnvs();
    await rm(parent, { force: true, recursive: true });
  });
  const dataDirectory = path.join(parent, "data");
  const databasePath = path.join(dataDirectory, "slopstagram.sqlite");
  vi.stubEnv("SLOPSTAGRAM_DATABASE_PATH", databasePath);
  vi.resetModules();

  await Promise.all(Object.values(modules).map(async (load) => await load()));

  expect(existsSync(dataDirectory)).toBe(false);
  expect(existsSync(databasePath)).toBe(false);
});

test("asking for the production runtime is what opens the database", async (context) => {
  const parent = await mkdtemp(path.join(tmpdir(), "slopstagram-open-"));
  const databasePath = path.join(parent, "data", "slopstagram.sqlite");
  vi.stubEnv("SLOPSTAGRAM_DATABASE_PATH", databasePath);
  vi.resetModules();
  const { getProductionRuntime } = await import("@@/core/domains/runtime/production-runtime.ts");
  context.onTestFinished(async () => {
    vi.unstubAllEnvs();
    getProductionRuntime().database.$client.close();
    await rm(parent, { force: true, recursive: true });
  });

  expect(existsSync(databasePath)).toBe(false);

  getProductionRuntime();

  expect(existsSync(databasePath)).toBe(true);
});
