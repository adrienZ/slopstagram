import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type TestContext } from "vitest";
import { createDrizzle } from "@@/core/database/client.ts";
import { ReportRepository } from "@@/core/database/repositories/report-repository.ts";
import { createWorld, now } from "./setup/report-world.ts";

async function createDirectory(context: Pick<TestContext, "onTestFinished">) {
  const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-report-backup-"));
  context.onTestFinished(async () => {
    await rm(directory, { force: true, recursive: true });
  });
  return directory;
}

test("a fetch run writes a backup that holds its report", async (context) => {
  const backupDirectory = path.join(await createDirectory(context), "backups");
  const world = await createWorld(context, { backupDirectory });

  const result = await world.run();

  const [backupName] = await readdir(backupDirectory);
  expect(backupName).toBe(`slopstagram-${now.toISOString().replaceAll(/[-:.]/gu, "")}.sqlite`);
  const backup = createDrizzle(path.join(backupDirectory, backupName));
  context.onTestFinished(() => {
    backup.$client.close();
  });
  expect(new ReportRepository(backup).findByKey(result.reportKey)).toStrictEqual(
    world.reports.findByKey(result.reportKey),
  );
});

test("a failed backup is logged and does not fail the fetch run", async (context) => {
  const directory = await createDirectory(context);
  const blocker = path.join(directory, "not-a-directory");
  await writeFile(blocker, "");
  const world = await createWorld(context, { backupDirectory: path.join(blocker, "backups") });

  const result = await world.run();

  expect(world.runs.list()[0]).toMatchObject({ reportKey: result.reportKey, status: "succeeded" });
  expect(world.logger.messages.join("\n")).toContain("backup");
});
