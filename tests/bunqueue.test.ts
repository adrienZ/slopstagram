import { expect, test } from "vitest";
import { createBunqueue } from "@@/core/fetch-run/bunqueue.ts";

test("the bunqueue adapter creates a queue and a worker without connecting", async () => {
  const bunqueue = createBunqueue();

  const queue = bunqueue.createQueue("unit-test");
  queue.close();
  const worker = bunqueue.createWorker(
    "unit-test",
    async () =>
      await Promise.resolve({
        counts: { failed: 0, fetched: 0, reels: 0, stories: 0 },
        outputFileName: "",
        reportKey: "",
      }),
    { autorun: false, concurrency: 1 },
  );
  await worker.close();

  expect(worker.run).toBeTypeOf("function");
});
