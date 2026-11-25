import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi, type TestContext } from "vitest";

async function useDataDirectory(context: TestContext): Promise<string> {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "slopstagram-data-dir-"));
  vi.stubEnv("SLOPSTAGRAM_DATA_DIR", dataDirectory);
  vi.resetModules();
  context.onTestFinished(async () => {
    vi.unstubAllEnvs();
    await rm(dataDirectory, { force: true, recursive: true });
  });

  return dataDirectory;
}

async function openProductionRuntime(context: TestContext): Promise<void> {
  const { getProductionRuntime } = await import("@@/core/domains/runtime/production-runtime.ts");
  getProductionRuntime();
  context.onTestFinished(() => {
    getProductionRuntime().database.$client.close();
  });
}

test("the production database lives in the chosen data folder", async (context) => {
  const dataDirectory = await useDataDirectory(context);
  vi.stubEnv("SLOPSTAGRAM_DATABASE_PATH", undefined);

  await openProductionRuntime(context);

  expect(existsSync(path.join(dataDirectory, "slopstagram.sqlite"))).toBe(true);
});

test("an explicit database path wins over the data folder", async (context) => {
  const dataDirectory = await useDataDirectory(context);
  const databasePath = path.join(dataDirectory, "elsewhere", "chosen.sqlite");
  vi.stubEnv("SLOPSTAGRAM_DATABASE_PATH", databasePath);

  await openProductionRuntime(context);

  expect(existsSync(databasePath)).toBe(true);
  expect(existsSync(path.join(dataDirectory, "slopstagram.sqlite"))).toBe(false);
});

test("the Playwright profile lives in the chosen data folder", async (context) => {
  const dataDirectory = await useDataDirectory(context);

  const { PLAYWRIGHT_PROFILE_DIR } = await import("@@/core/utils/app-data-paths.ts");

  expect(PLAYWRIGHT_PROFILE_DIR).toBe(path.join(dataDirectory, "playwright", "user-data"));
});
