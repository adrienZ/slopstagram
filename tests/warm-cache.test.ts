import { readdir } from "node:fs/promises";
import path from "node:path";
import { assert, test, expect } from "vitest";
import { createInstagramClient } from "../sdk/story-client-service.ts";
import {
  startWarmCacheQueue,
  WARM_CACHE_CRON_PATTERN,
  WARM_CACHE_QUEUE_NAME,
  type WarmCacheQueueDependencies,
} from "../sdk/warm-cache-queue.ts";
import { runWarmCacheJob } from "../sdk/warm-cache.ts";
import { createFailingSession } from "./instagram-session.ts";
import { audioUrl, createWorld, musicStoryPk, storyPks } from "./report-world.ts";

/** Every file the job cached, relative to the cache directory. */
async function listCacheFiles(directory: string): Promise<Array<string>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .toSorted();
}

test("runWarmCacheJob runs the whole pipeline and stores the report, database rows and cached media", async (context) => {
  const world = await createWorld(context);

  const result = await runWarmCacheJob({
    boundaries: world.boundaries,
    logger: world.logger,
    payload: { args: ["--report-name", "ignored"], reportArgs: ["--report-name", "synthetic"] },
  });

  expect(result).toStrictEqual({
    counts: { failed: 0, fetched: 3, reels: 2, stories: 3 },
    outputFileName: result.reportKey,
    reportKey: result.reportKey,
  });
  expect(world.reports.listKeys()).toStrictEqual([result.reportKey]);
  expect(world.runs.list()).toMatchObject([
    { reportKey: result.reportKey, status: "succeeded", storiesCount: 3 },
  ]);

  // The stories, with their enrichment, are stored in the database.
  const saved = world.reports.findByKey(result.reportKey);
  assert.ok(saved);
  const mediaPks = saved.output.users.flatMap((user) =>
    user.stories.map((story) => story.media_pk),
  );
  expect(mediaPks.toSorted()).toStrictEqual(storyPks);
  for (const [position, mediaPk] of mediaPks.entries()) {
    expect(world.stories.findByMediaPk(mediaPk)).not.toBeNull();
    expect(world.appleVision.findByMediaPk(mediaPk)).toBe(`Synthetic caption ${position}`);
    expect(world.vision.findByMediaPk(mediaPk)?.result.visual).toBe(`Synthetic scene ${position}`);
  }
  expect(world.users.listAll().map(({ username }) => username)).toStrictEqual([
    "user_008",
    "user_072",
  ]);

  // The media output: warming the cache downloaded every preview, avatar and the audio.
  const files = await listCacheFiles(world.cacheDirectory);
  expect(files).toStrictEqual(
    expect.arrayContaining([
      ...mediaPks.map((mediaPk) => `images/story-previews/${mediaPk}.jpg`),
      ...world.users.listAll().map(({ pk }) => `images/avatars/${pk}.jpg`),
    ]),
  );
  const music = world.stories.findByMediaPk(musicStoryPk)?.annotations?.musicObservations?.[0];
  const audioCachePath = music?.metadata.audioCachePath;
  assert.ok(audioCachePath !== null && audioCachePath !== undefined);
  expect(files).toContain(audioCachePath);
  expect(world.calls).toContain(`media ${audioUrl}`);
});

test("runWarmCacheJob accepts an empty payload", async (context) => {
  const world = await createWorld(context);

  const result = await runWarmCacheJob({ boundaries: world.boundaries, logger: world.logger });

  expect(world.reports.listKeys()).toStrictEqual([result.reportKey]);
  expect(result.counts.fetched).toBe(3);
});

test("runWarmCacheJob stores nothing in the cache when Instagram refuses the request", async (context) => {
  const world = await createWorld(context);
  const client = createInstagramClient(createFailingSession(401));

  await expect(
    runWarmCacheJob({
      boundaries: { ...world.boundaries, client },
      logger: world.logger,
    }),
  ).rejects.toThrow(/HTTP 401/u);

  expect(world.runs.list()).toMatchObject([{ reportKey: null, status: "failed" }]);
  expect(world.reports.listKeys()).toStrictEqual([]);
  expect(await listCacheFiles(world.cacheDirectory)).toStrictEqual([]);
});

test("startWarmCacheQueue schedules and processes warm-cache jobs", async (context) => {
  const world = await createWorld(context);
  const calls: Array<{ arguments: Array<unknown>; name: string }> = [];
  let processor: Parameters<WarmCacheQueueDependencies["createWorker"]>[1] | undefined;
  let workerErrorListener: ((error: Error) => void) | undefined;
  const workerError = new Error("worker failed");
  const capturedErrors: Array<Error> = [];

  const runtime = startWarmCacheQueue({
    boundaries: world.boundaries,
    dependencies: {
      createQueue(name) {
        calls.push({ arguments: [], name: `queue:${name}` });
        return {
          close() {
            calls.push({ arguments: [], name: "queue:close" });
          },
          async waitUntilReady() {
            calls.push({ arguments: [], name: "queue:ready" });
          },
          async upsertJobScheduler(...arguments_) {
            calls.push({ arguments: arguments_, name: "queue:schedule" });
          },
        };
      },
      createWorker(name, nextProcessor, options) {
        calls.push({ arguments: [options], name: `worker:${name}` });
        processor = nextProcessor;
        return {
          async close() {
            calls.push({ arguments: [], name: "worker:close" });
          },
          on(_event, listener) {
            workerErrorListener = listener;
            return this;
          },
          run() {
            calls.push({ arguments: [], name: "worker:run" });
          },
          async waitUntilReady() {
            calls.push({ arguments: [], name: "worker:ready" });
          },
        };
      },
    },
    logger: world.logger,
    onError(error) {
      capturedErrors.push(error);
    },
  });

  await runtime.ready;
  assert.ok(processor);
  const result = await processor({ data: { reportArgs: ["--report-name", "queued"] } });
  expect(result).toStrictEqual({
    counts: { failed: 0, fetched: 3, reels: 2, stories: 3 },
    outputFileName: result.reportKey,
    reportKey: result.reportKey,
  });

  workerErrorListener?.(workerError);
  expect(capturedErrors).toStrictEqual([workerError]);

  await runtime.close();
  expect(calls).toStrictEqual([
    {
      arguments: [],
      name: `queue:${WARM_CACHE_QUEUE_NAME}`,
    },
    {
      arguments: [{ autorun: false, concurrency: 1 }],
      name: `worker:${WARM_CACHE_QUEUE_NAME}`,
    },
    { arguments: [], name: "queue:ready" },
    {
      arguments: [
        WARM_CACHE_QUEUE_NAME,
        { pattern: WARM_CACHE_CRON_PATTERN },
        {
          data: {},
          name: WARM_CACHE_QUEUE_NAME,
          opts: {
            attempts: 3,
            backoff: { delay: 1000, type: "exponential" },
          },
        },
      ],
      name: "queue:schedule",
    },
    { arguments: [], name: "worker:run" },
    { arguments: [], name: "worker:ready" },
    { arguments: [], name: "worker:close" },
    { arguments: [], name: "queue:close" },
  ]);
});

test("startWarmCacheQueue retries while the standalone server starts", async () => {
  let readyAttempts = 0;
  const calls: Array<string> = [];

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue() {
        return {
          close() {},
          async waitUntilReady() {
            readyAttempts += 1;
            if (readyAttempts === 1) {
              throw new Error("server is starting");
            }
          },
          async upsertJobScheduler() {
            calls.push("schedule");
          },
        };
      },
      createWorker() {
        return {
          close: async () => {},
          on() {
            return this;
          },
          run() {
            calls.push("worker:run");
          },
          async waitUntilReady() {
            calls.push("worker:ready");
          },
        };
      },
    },
  });

  await runtime.ready;
  expect(readyAttempts).toBe(2);
  expect(calls).toStrictEqual(["schedule", "worker:run", "worker:ready"]);
  await runtime.close();
});

test("startWarmCacheQueue cleans up when its worker fails to close", async () => {
  const calls: Array<string> = [];
  const closeFailure = new Error("close failed");

  const runtime = startWarmCacheQueue({
    dependencies: {
      createQueue() {
        return {
          close() {
            calls.push("queue:close");
          },
          waitUntilReady: async () => {},
          upsertJobScheduler: async () => {},
        };
      },
      createWorker() {
        return {
          async close() {
            calls.push("worker:close");
            throw closeFailure;
          },
          on() {
            return this;
          },
          run() {},
          waitUntilReady: async () => {},
        };
      },
    },
  });

  await runtime.ready;
  await expect(runtime.close()).rejects.toThrow(closeFailure);
  expect(calls).toStrictEqual(["worker:close", "queue:close"]);
});
