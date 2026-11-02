import { expect, test } from "vitest";
import { createBunqueue } from "@@/core/fetch-run/bunqueue.ts";

test("the bunqueue adapter creates a closable queue without a server", async () => {
  const queue = createBunqueue(
    "unit-test",
    async () =>
      await Promise.resolve({
        counts: { failed: 0, fetched: 0, reels: 0, stories: 0 },
        outputFileName: "",
        reportKey: "",
      }),
  );
  queue.on("error", () => {});

  await queue.close();

  expect(queue.isClosed()).toBe(true);
});
