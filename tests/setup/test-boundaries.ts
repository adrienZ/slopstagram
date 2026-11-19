import type { InstagramClient } from "@@/core/domains/instagram/instagram-types.ts";
import type { InstagramConnection } from "@@/core/domains/runtime/fetch-boundaries.ts";
import type { RuntimeBoundaries } from "@@/core/domains/runtime/runtime.ts";
import { createMemoryCacheStorage } from "../memory-storage.ts";
import { createMockLogger } from "../mock-helpers.ts";

function noFake(boundary: string): Error {
  return new Error(`The test runtime has no fake for ${boundary}. Pass one to createTestRuntime.`);
}

function unexpected(boundary: string) {
  return async (): Promise<never> => {
    await Promise.resolve();
    throw noFake(boundary);
  };
}

/** Every boundary that reaches outside the process fails on use unless a test overrides it. */
export function testBoundaries(overrides: Partial<RuntimeBoundaries> = {}): RuntimeBoundaries {
  return {
    backup: () => {
      // The test runtime copies nothing; a test that cares passes a fake.
    },
    fetchImage: unexpected("fetchImage"),
    fetchMedia: unexpected("fetchMedia"),
    fetchOllama: unexpected("fetchOllama"),
    logger: createMockLogger(),
    openInstagram: unexpected("openInstagram"),
    queue: () => {
      throw noFake("queue");
    },
    runAppleOcr: unexpected("runAppleOcr"),
    storage: createMemoryCacheStorage(),
    ...overrides,
  };
}

/** Opens `client` as the Instagram connection of each fetch run, counting opens and closes. */
export function connect(client: InstagramClient) {
  const connection = Object.assign(
    async (): Promise<InstagramConnection> => {
      connection.opened += 1;

      return await Promise.resolve({
        client,
        close: async () => {
          connection.closed += 1;
          await Promise.resolve();
        },
      });
    },
    { closed: 0, opened: 0 },
  );

  return connection;
}
