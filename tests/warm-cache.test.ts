import { afterEach, assert, beforeEach, test, expect, vi } from "vitest";
import {
  startWarmCacheQueue,
  WARM_CACHE_CRON_PATTERN,
  WARM_CACHE_QUEUE_NAME,
} from "@@/core/domains/fetch-run/warm-cache-queue.ts";
import { runWarmCacheJob } from "@@/core/domains/fetch-run/warm-cache.ts";
import { audioUrl, createWorld, musicStoryPk, now, storyPks } from "./setup/report-world.ts";
import { createFailingClient } from "./setup/recorded-client.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";
import type { FetchRunQueue } from "@@/core/runtime/fetch-boundaries.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";

// The job reads the clock itself. The recorded stories are dated around `now`, so the feed
// that the user summaries are written from only holds them when the clock reads `now` too.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Every media file the job cached, as the paths the report points at. */
async function listCacheFiles(storage: Runtime["storage"]): Promise<Array<string>> {
  const [images, audio] = await Promise.all([storage.images.getKeys(), storage.audio.getKeys()]);
  return [
    ...images.map((key) => `images/${key.replaceAll(":", "/")}`),
    ...audio.map((key) => `audio/${key}`),
  ].toSorted();
}

test("runWarmCacheJob runs the whole pipeline and stores the report, database rows and cached media", async (context) => {
  const world = await createWorld(context);

  const result = await runWarmCacheJob(world.runtime);

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

  // One summary per account, written from the stored vision analyses.
  expect(world.ollama.requests.filter(({ kind }) => kind === "summary")).toHaveLength(2);
  expect(world.ollama.requests.filter(({ kind }) => kind === "vision")).toHaveLength(3);

  // The media output: warming the cache downloaded every preview, avatar and the audio.
  const files = await listCacheFiles(world.storage);
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

  const result = await runWarmCacheJob(world.runtime);

  expect(world.reports.listKeys()).toStrictEqual([result.reportKey]);
  expect(result.counts.fetched).toBe(3);
});

test("runWarmCacheJob stores nothing in the cache when Instagram refuses the request", async (context) => {
  const world = await createWorld(context, { client: createFailingClient(401) });

  await expect(runWarmCacheJob(world.runtime)).rejects.toThrow(/HTTP 401/u);

  expect(world.runs.list()).toMatchObject([{ reportKey: null, status: "failed" }]);
  expect(world.reports.listKeys()).toStrictEqual([]);
  expect(await listCacheFiles(world.storage)).toStrictEqual([]);
});

test("startWarmCacheQueue schedules the hourly job, runs it and forwards errors", async (context) => {
  const calls: Array<string> = [];
  let processor: Parameters<FetchRunQueue>[1] | undefined;
  let errorListener: ((error: Error) => void) | undefined;
  const queueError = new Error("queue failed");
  const capturedErrors: Array<Error> = [];
  const world = await createWorld(context, {
    queue(name, nextProcessor) {
      processor = nextProcessor;
      calls.push(`queue:${name}`);
      return {
        async close() {
          calls.push("close");
        },
        async cron(id, pattern) {
          calls.push(`cron:${id}:${pattern}`);
          return null;
        },
        on(_event, listener) {
          errorListener = listener;
        },
      };
    },
  });

  const started = startWarmCacheQueue(world.runtime, {
    onError(error) {
      capturedErrors.push(error);
    },
  });

  await started.ready;
  assert.ok(processor);
  const result = await processor();
  expect(result).toStrictEqual({
    counts: { failed: 0, fetched: 3, reels: 2, stories: 3 },
    outputFileName: result.reportKey,
    reportKey: result.reportKey,
  });

  errorListener?.(queueError);
  expect(capturedErrors).toStrictEqual([queueError]);

  await started.close();
  expect(calls).toStrictEqual([
    `queue:${WARM_CACHE_QUEUE_NAME}`,
    `cron:${WARM_CACHE_QUEUE_NAME}:${WARM_CACHE_CRON_PATTERN}`,
    "close",
  ]);
});

test("startWarmCacheQueue reports a failure to schedule the job", async (context) => {
  const started = startWarmCacheQueue(
    await createTestRuntime(context, {
      queue: () => ({
        close: async () => {},
        cron: async () => {
          throw new Error("schedule failed");
        },
        on() {},
      }),
    }),
  );

  await expect(started.ready).rejects.toThrow("schedule failed");
});
