import { afterAll, beforeAll, type TestContext } from "vitest";
import type { DrizzleDatabase } from "@@/core/domains/database/client.ts";
import type { InstagramClient } from "@@/core/domains/instagram/instagram-types.ts";
import type { WithInstagramClient } from "@@/core/domains/runtime/fetch-boundaries.ts";
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

type TestBoundaries = Partial<RuntimeBoundaries>;

export function servingClient(client: InstagramClient): WithInstagramClient {
  return async (run) => await run(client);
}

async function createRuntimeOver(database: DrizzleDatabase, boundaries: TestBoundaries) {
  return createRuntime(database, {
    backup: noBackup,
    fetchImage: unexpected("fetchImage"),
    fetchMedia: unexpected("fetchMedia"),
    fetchOllama: unexpected("fetchOllama"),
    logger: createMockLogger(),
    queue: noQueue,
    runAppleOcr: unexpected("runAppleOcr"),
    storage: createMemoryCacheStorage(),
    withInstagramClient: servingClient(await createRecordedInstagramClient()),
    ...boundaries,
  });
}

/** A runtime over a fresh in-memory database and stores; other boundaries fail on use unless overridden. */
export async function createTestRuntime(
  context: Pick<TestContext, "onTestFinished">,
  boundaries: TestBoundaries = {},
) {
  return await createRuntimeOver(createTestDatabase(context), boundaries);
}

export function shareTestRuntime(
  seed: (runtime: Runtime) => Promise<void>,
  boundaries: TestBoundaries = {},
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
