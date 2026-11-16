import { afterAll, beforeAll, type TestContext } from "vitest";
import type { DrizzleDatabase } from "@@/core/domains/database/client.ts";
import {
  createRuntime,
  type Runtime,
  type RuntimeBoundaries,
} from "@@/core/domains/runtime/runtime.ts";
import { createRecordedInstagramClient } from "./seed.ts";
import { createMemoryCacheStorage } from "../memory-storage.ts";
import { createMockLogger } from "../mock-helpers.ts";
import { createMigratedDatabase, createTestDatabase } from "../test-database.ts";

function unexpected(boundary: string) {
  return async (): Promise<never> => {
    await Promise.resolve();
    throw new Error(`The test runtime has no fake for ${boundary}. Pass one to createTestRuntime.`);
  };
}

function noQueue(): never {
  throw new Error("The test runtime has no fake for queue. Pass one to createTestRuntime.");
}

function noBackup(): void {
  // The test runtime copies nothing; a test that cares passes a fake.
}

// `??` rather than a spread: a boundary passed as `undefined` would replace its fake, and
// createRuntime would fall back to the real one (the media cache in data/, bunqueue).
async function createRuntimeOver(database: DrizzleDatabase, boundaries: RuntimeBoundaries) {
  return createRuntime(database, {
    backup: boundaries.backup ?? noBackup,
    client: boundaries.client ?? (await createRecordedInstagramClient()),
    fetchImage: boundaries.fetchImage ?? unexpected("fetchImage"),
    fetchMedia: boundaries.fetchMedia ?? unexpected("fetchMedia"),
    fetchOllama: boundaries.fetchOllama ?? unexpected("fetchOllama"),
    logger: boundaries.logger ?? createMockLogger(),
    queue: boundaries.queue ?? noQueue,
    runAppleOcr: boundaries.runAppleOcr ?? unexpected("runAppleOcr"),
    storage: boundaries.storage ?? createMemoryCacheStorage(),
  });
}

/** A runtime over a fresh in-memory database and stores; other boundaries fail on use unless overridden. */
export async function createTestRuntime(
  context: Pick<TestContext, "onTestFinished">,
  boundaries: RuntimeBoundaries = {},
) {
  return await createRuntimeOver(createTestDatabase(context), boundaries);
}

export function shareTestRuntime(
  seed: (runtime: Runtime) => Promise<void>,
  boundaries: RuntimeBoundaries = {},
) {
  let current: Runtime | undefined;
  beforeAll(async () => {
    current = await createRuntimeOver(createMigratedDatabase(), boundaries);
    await seed(current);
  });
  afterAll(() => {
    current?.database.$client.close();
  });

  return {
    get runtime(): Runtime {
      if (current === undefined) {
        throw new Error("The shared test runtime is only available once the tests run.");
      }

      return current;
    },
  };
}
