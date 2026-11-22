import { expect, test } from "vitest";
import { loadSidebarUsers } from "../app/loaders/sidebar-users.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";
import { saveSummaryUsers } from "./test-database.ts";

test("lists the saved accounts with the avatar the media route serves", async (context) => {
  const runtime = await createTestRuntime(context);
  await saveSummaryUsers(runtime, ["alice", "bob"]);

  expect(loadSidebarUsers(runtime)).toStrictEqual([
    { username: "alice", avatarPath: "/media/avatars/alice.jpg" },
    { username: "bob", avatarPath: "/media/avatars/bob.jpg" },
  ]);
});

test("lists nothing for a runtime without saved accounts", async (context) => {
  const runtime = await createTestRuntime(context);

  expect(loadSidebarUsers(runtime)).toStrictEqual([]);
});
