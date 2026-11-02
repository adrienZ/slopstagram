import type { TestContext } from "vitest";
import type { RuntimeBoundaries } from "@@/core/runtime/runtime.ts";
import { createRuntime } from "@@/core/runtime/runtime.ts";
import { createRecordedInstagramClient } from "./seed.ts";
import { createMemoryCacheStorage } from "../memory-storage.ts";
import { createTestDatabase } from "../test-database.ts";

function unexpected(boundary: string) {
  return async (): Promise<never> => {
    await Promise.resolve();
    throw new Error(`The test runtime has no fake for ${boundary}. Pass one to createTestRuntime.`);
  };
}

/** A runtime over a fresh in-memory database and stores; other boundaries fail on use unless overridden. */
export async function createTestRuntime(
  context: Pick<TestContext, "onTestFinished">,
  boundaries: RuntimeBoundaries = {},
) {
  return createRuntime(createTestDatabase(context), {
    client: await createRecordedInstagramClient(),
    fetchImage: unexpected("fetchImage"),
    fetchMedia: unexpected("fetchMedia"),
    fetchOllama: unexpected("fetchOllama"),
    runAppleOcr: unexpected("runAppleOcr"),
    storage: createMemoryCacheStorage(),
    ...boundaries,
  });
}
