import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadPaths(env: { dataDir?: string; databasePath?: string }) {
  vi.stubEnv("SLOPSTAGRAM_DATA_DIR", env.dataDir);
  vi.stubEnv("SLOPSTAGRAM_DATABASE_PATH", env.databasePath);
  vi.resetModules();
  return await import("@@/core/utils/app-data-paths.ts");
}

describe("app data paths", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("resolves the database, cache and Playwright profile under the data directory override", async () => {
    const paths = await loadPaths({ dataDir: "/tmp/slopstagram-main-data" });

    expect(paths.APP_DATABASE_PATH).toBe("/tmp/slopstagram-main-data/slopstagram.sqlite");
    expect(paths.APP_SNAPSHOT_PATH).toBe("/tmp/slopstagram-main-data/slopstagram.snapshot.sqlite");
    expect(paths.APP_CACHE_DIR).toBe("/tmp/slopstagram-main-data/cache");
    expect(paths.PLAYWRIGHT_PROFILE_DIR).toBe("/tmp/slopstagram-main-data/playwright/user-data");
  });

  it("resolves a relative data directory override against the working directory", async () => {
    const paths = await loadPaths({ dataDir: "../main-data" });

    expect(paths.APP_CACHE_DIR).toBe(path.resolve("../main-data", "cache"));
  });

  it("keeps the paths under data/ without the override", async () => {
    const paths = await loadPaths({});

    expect(paths.APP_DATABASE_PATH).toBe(path.resolve("data", "slopstagram.sqlite"));
    expect(paths.APP_CACHE_DIR).toBe(path.resolve("data", "cache"));
    expect(paths.PLAYWRIGHT_PROFILE_DIR).toBe(path.resolve("data", "playwright", "user-data"));
  });

  it("lets the database path override decide the database file", async () => {
    const paths = await loadPaths({
      dataDir: "/tmp/slopstagram-main-data",
      databasePath: "/tmp/copy/snapshot.sqlite",
    });

    expect(paths.APP_DATABASE_PATH).toBe("/tmp/copy/snapshot.sqlite");
    expect(paths.APP_CACHE_DIR).toBe("/tmp/slopstagram-main-data/cache");
  });
});
