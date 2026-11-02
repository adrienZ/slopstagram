import { expect, test, type OnTestFinishedHandler } from "vitest";
import { useDrizzle } from "@@/core/database/client.ts";
import { migrateDatabase } from "@@/core/database/migrate.ts";
import { storyRepository } from "@@/core/database/repositories/story-repository.ts";
import { fetchStories } from "@@/core/fetch-run/stories.ts";
import { getProductionRuntime } from "@@/core/runtime/production-runtime.ts";
import { createMockLogger, noSleep } from "./mock-helpers.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

const recordedStoryPk = "700000000000079";

async function answerOllama() {
  return await Promise.resolve(new globalThis.Response("{}"));
}

test("a test runtime ingests recorded stories into its own database", async (context) => {
  migrateDatabase(useDrizzle());
  const runtime = await createTestRuntime(context);

  const report = await fetchStories({
    client: runtime.client,
    logger: createMockLogger(),
    maxAttempts: 1,
    sleep: noSleep,
    storyRepository: runtime.stories,
    storyStorage: createMemoryStorage(),
  });

  expect(report.failures).toEqual([]);
  expect(runtime.stories.findByMediaPk(recordedStoryPk)).not.toBeNull();
  expect(storyRepository.findByMediaPk(recordedStoryPk)).toBeNull();
});

test("two test runtimes do not share a database", async (context) => {
  const first = await createTestRuntime(context);
  const second = await createTestRuntime(context);

  await fetchStories({
    client: first.client,
    logger: createMockLogger(),
    maxAttempts: 1,
    sleep: noSleep,
    storyRepository: first.stories,
    storyStorage: createMemoryStorage(),
  });

  expect(first.stories.findByMediaPk(recordedStoryPk)).not.toBeNull();
  expect(second.stories.findByMediaPk(recordedStoryPk)).toBeNull();
});

test("a test runtime closes its database when its test ends", async (context) => {
  const handlers: Array<OnTestFinishedHandler> = [];
  const runtime = await createTestRuntime({
    onTestFinished: (handler) => {
      handlers.push(handler);
    },
  });

  expect(runtime.stories.findByMediaPk(recordedStoryPk)).toBeNull();

  await Promise.all(
    handlers.map(async (handler) => {
      await handler(context);
    }),
  );

  expect(() => runtime.stories.findByMediaPk(recordedStoryPk)).toThrow();
});

test("a test runtime overrides only the boundary a test passes", async (context) => {
  const runtime = await createTestRuntime(context, { fetchOllama: answerOllama });

  expect(runtime.fetchOllama).toBe(answerOllama);
  await expect(runtime.fetchImage?.("https://example.com/a.jpg")).rejects.toThrow(
    "no fake for fetchImage",
  );
});

test("the production runtime is created once and reused", () => {
  const runtime = getProductionRuntime();

  expect(getProductionRuntime()).toBe(runtime);
  expect(runtime.client).toBeUndefined();
});
