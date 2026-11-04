import { expect, test, type OnTestFinishedHandler } from "vitest";
import { fetchStories } from "@@/core/domains/fetch-run/stories.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";
import { createCapturingLogger, noSleep } from "./mock-helpers.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

const recordedStoryPk = "700000000000079";

async function answerOllama() {
  return await Promise.resolve(new globalThis.Response("{}"));
}

test("a test runtime ingests recorded stories into its own database", async (context) => {
  const runtime = await createTestRuntime(context);

  const report = await fetchStories(runtime, { maxAttempts: 1, sleep: noSleep });

  expect(report.failures).toEqual([]);
  expect(runtime.stories.findByMediaPk(recordedStoryPk)).not.toBeNull();
});

test("two test runtimes do not share a database", async (context) => {
  const first = await createTestRuntime(context);
  const second = await createTestRuntime(context);

  await fetchStories(first, { maxAttempts: 1, sleep: noSleep });

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

test("a test runtime logs through the logger a test passes", async (context) => {
  const logger = createCapturingLogger();
  const runtime = await createTestRuntime(context, { logger });

  runtime.logger.warn("retrying");

  expect(runtime.logger).toBe(logger);
  expect(logger.messages).toStrictEqual(["warn: retrying"]);
});

test("a test runtime has no queue unless a test passes one", async (context) => {
  const runtime = await createTestRuntime(context);

  expect(() =>
    runtime.queue("warm-cache", async () => await Promise.reject(new Error("unused"))),
  ).toThrow("no fake for queue");
});

test("the production runtime is created once and reused", () => {
  const runtime = getProductionRuntime();

  expect(getProductionRuntime()).toBe(runtime);
  expect(runtime.client).toBeUndefined();
  expect(runtime.logger.options.defaults.tag).toBe("runtime");
  expect(runtime.queue).toBeTypeOf("function");
  expect(Object.keys(runtime.storage).toSorted()).toStrictEqual(["audio", "images", "stories"]);
});

test("the production runtime does not migrate its database", () => {
  expect(() => getProductionRuntime().stories.findByMediaPk(recordedStoryPk)).toThrow(
    "Failed query",
  );
});
