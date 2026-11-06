import { expect, test } from "vitest";
import { createWorld, now } from "@@/tests/setup/report-world.ts";

test("a fetch run backs up the database once, after it finished", async (context) => {
  let statusAtBackup: string | undefined;
  const world = await createWorld(context, {
    backup: () => {
      statusAtBackup = world.runs.list()[0]?.status;
    },
  });

  await world.run();

  expect(world.backups).toStrictEqual([now]);
  expect(statusAtBackup).toBe("succeeded");
});

test("a failed backup is logged and does not fail the fetch run", async (context) => {
  const world = await createWorld(context, {
    backup: () => {
      throw new Error("disk full");
    },
  });

  const result = await world.run();

  expect(world.runs.list()[0]).toMatchObject({ reportKey: result.reportKey, status: "succeeded" });
  expect(world.logger.messages.join("\n")).toContain("database backup failed: disk full");
});
