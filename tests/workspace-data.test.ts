import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("web reads reports and serves media written by the SDK in a separate process", async (context) => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "slopstagram-workspace-data-"));
  context.after(async () => {
    await rm(dataDirectory, { recursive: true, force: true });
  });

  function run(cwd: string, code: string): void {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", code],
      {
        cwd: path.join(repositoryRoot, cwd),
        env: { ...process.env, SLOPSTAGRAM_DATA_DIR: dataDirectory },
        encoding: "utf-8",
        timeout: 10_000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
  }

  // Tests may initialize isolated databases; report scripts still require one.
  run(
    ".",
    `
    import { migrateDatabase } from "@slopstagram/sdk/database/migrate.ts";
    migrateDatabase();
  `,
  );

  run(
    "packages/sdk",
    `
    import { mkdir, writeFile } from "node:fs/promises";
    import path from "node:path";
    import { reportRepository } from "@slopstagram/sdk/repositories/report-repository.ts";
    import { BASE_CACHE_DIR, IMAGES_STORAGE_DIR } from "@slopstagram/sdk/lib/cache-service.ts";

    await reportRepository.save("workspace-report", {
      failures: [],
      manifest: { users: [] },
      metadata: {
        broadcasts_count: 0,
        counts: { cache_hits: 0, cache_misses: 0, failed: 0, fetched: 0, reels: 0, stories: 0 },
        created_at: "2026-10-22T12:00:00.000Z",
        report_name: "workspace-report",
        status: "ok",
        story_ranking_token: null,
      },
      output: { users: [] },
    });
    const images = path.join(BASE_CACHE_DIR, IMAGES_STORAGE_DIR, "story-previews");
    await mkdir(images, { recursive: true });
    await writeFile(path.join(images, "workspace.jpg"), "shared-image");
  `,
  );

  run(
    "apps/web",
    `
    import assert from "node:assert/strict";
    import { readReport } from "./server/report-repository.ts";
    import { createMediaResponse } from "./server/routes/media/[...path].ts";

    assert.equal(readReport("workspace-report").metadata.report_name, "workspace-report");
    const response = await createMediaResponse("story-previews/workspace.jpg");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(await response.text(), "shared-image");
  `,
  );
});
