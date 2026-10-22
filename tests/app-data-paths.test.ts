import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { z } from "zod";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const dataPathsUrl = new URL("../packages/sdk/lib/app-data-paths.ts", import.meta.url).href;

test("commands share the existing database, media cache, and browser profile across working directories", () => {
  const env = { ...process.env };
  delete env.SLOPSTAGRAM_DATA_DIR;

  for (const cwd of [
    repositoryRoot,
    path.join(repositoryRoot, "packages/sdk"),
    path.join(repositoryRoot, "apps/web"),
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import * as paths from ${JSON.stringify(dataPathsUrl)}; console.log(JSON.stringify(paths));`,
      ],
      { cwd, env, encoding: "utf-8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const paths = z.record(z.string(), z.string()).parse(JSON.parse(result.stdout));
    assert.equal(paths.APP_DATABASE_PATH, path.join(repositoryRoot, "data/slopstagram.sqlite"));
    assert.equal(paths.APP_CACHE_DIR, path.join(repositoryRoot, "data/cache"));
    assert.equal(
      paths.PLAYWRIGHT_PROFILE_DIR,
      path.join(repositoryRoot, "data/playwright/user-data"),
    );
  }
});
