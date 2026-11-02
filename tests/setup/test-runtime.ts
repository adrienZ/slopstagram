import type { TestContext } from "vitest";
import type { RuntimeBoundaries } from "@@/core/runtime/runtime.ts";
import { createRuntime } from "@@/core/runtime/runtime.ts";
import { createRecordedInstagramClient } from "./seed.ts";
import { createTestDatabase } from "../test-database.ts";

/** A boundary no test is meant to reach: it fails loudly instead of calling the network. */
function unexpected(boundary: string) {
  return async (): Promise<never> => {
    await Promise.resolve();
    throw new Error(`The test runtime has no fake for ${boundary}. Pass one to createTestRuntime.`);
  };
}

/**
 * A runtime over a fresh migrated in-memory database, closed when the test ends. The Instagram
 * client answers from the recorded payloads and every other external boundary fails on use, so
 * a test overrides only the boundary it needs.
 */
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
    ...boundaries,
  });
}
