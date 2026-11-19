import { afterAll, beforeAll, type TestContext } from "vitest";
import type { DrizzleDatabase } from "@@/core/domains/database/client.ts";
import {
  createRuntime,
  type Runtime,
  type RuntimeBoundaries,
} from "@@/core/domains/runtime/runtime.ts";
import { createRecordedInstagramClient } from "./seed.ts";
import { connect, testBoundaries } from "./test-boundaries.ts";
import { createMigratedDatabase, createTestDatabase } from "../test-database.ts";

async function createRuntimeOver(
  database: DrizzleDatabase,
  boundaries: Partial<RuntimeBoundaries>,
) {
  return createRuntime(
    database,
    testBoundaries({
      openInstagram: connect(await createRecordedInstagramClient()),
      ...boundaries,
    }),
  );
}

/** A runtime over a fresh in-memory database and stores; other boundaries fail on use unless overridden. */
export async function createTestRuntime(
  context: Pick<TestContext, "onTestFinished">,
  boundaries: Partial<RuntimeBoundaries> = {},
) {
  return await createRuntimeOver(createTestDatabase(context), boundaries);
}

export function shareTestRuntime(
  seed: (runtime: Runtime) => Promise<void>,
  boundaries: Partial<RuntimeBoundaries> = {},
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
