import { expect, test, type TestContext } from "vitest";
import { searchAccounts } from "@@/core/domains/accounts/accounts.ts";
import {
  editRecordedUsers,
  readRecordedPayloads,
  seedRecordedStories,
} from "@@/tests/setup/seed.ts";
import { createTestRuntime } from "@@/tests/setup/test-runtime.ts";

type AccountSpec = [username: string, fullName: string | null];

/**
 * A runtime whose accounts come from real ingestion of the recorded gallery, which holds
 * three accounts. The recording is edited so that they carry the given usernames and names.
 */
async function createAccounts(
  context: TestContext,
  accounts: [AccountSpec, AccountSpec, AccountSpec],
) {
  const recorded = editRecordedUsers(
    await readRecordedPayloads(["instagram-story-data.json"]),
    (user, position) => {
      const [username, fullName] = accounts[position] ?? [user.username, null];
      user.username = username;
      // The recorded accounts carry no full name.
      if (fullName !== null) {
        user.full_name = fullName;
      }
    },
  );
  const runtime = await createTestRuntime(context);
  await seedRecordedStories(runtime, recorded);
  return runtime;
}

function usernamesOf(found: ReturnType<typeof searchAccounts>) {
  return found.accounts.map(({ username }) => username);
}

test("a search matches usernames and full names, ignoring case, accents and a leading @", async (context) => {
  const runtime = await createAccounts(context, [
    ["user_one", "Alpha One"],
    ["user_two", "Éloïse Beta"],
    ["user_three", null],
  ]);

  expect(usernamesOf(searchAccounts(runtime, "USER_ONE"))).toStrictEqual(["user_one"]);
  expect(usernamesOf(searchAccounts(runtime, "@user_three"))).toStrictEqual(["user_three"]);
  expect(usernamesOf(searchAccounts(runtime, "alpha"))).toStrictEqual(["user_one"]);
  expect(usernamesOf(searchAccounts(runtime, "eloise beta"))).toStrictEqual(["user_two"]);
  expect(usernamesOf(searchAccounts(runtime, "éloïse"))).toStrictEqual(["user_two"]);
  expect(usernamesOf(searchAccounts(runtime, "nobody"))).toStrictEqual([]);
});

test("a search ranks the exact username, then the prefixes, then the full names", async (context) => {
  const runtime = await createAccounts(context, [
    ["fan_page", "Club fan"],
    ["club.paris", null],
    ["club", null],
  ]);

  expect(usernamesOf(searchAccounts(runtime, "club"))).toStrictEqual([
    "club",
    "club.paris",
    "fan_page",
  ]);
});

test("a search ranks the usernames that contain the query before the full names", async (context) => {
  const runtime = await createAccounts(context, [
    ["fan_page", "Club fan"],
    ["my_club", null],
    ["other", null],
  ]);

  expect(usernamesOf(searchAccounts(runtime, "club"))).toStrictEqual(["my_club", "fan_page"]);
});

test("a search carries each account's handle and full name", async (context) => {
  const runtime = await createAccounts(context, [
    ["user_one", "Alpha One"],
    ["user_two", null],
    ["user_three", null],
  ]);

  expect(searchAccounts(runtime, "alpha")).toStrictEqual({
    accounts: [{ fullName: "Alpha One", handle: "@user_one", username: "user_one" }],
    total: 1,
  });
});

test("a search returns at most the limit but counts every match", async (context) => {
  const runtime = await createAccounts(context, [
    ["user_one", null],
    ["user_two", null],
    ["user_three", null],
  ]);

  const found = searchAccounts(runtime, "user_", 2);

  expect(found.accounts).toHaveLength(2);
  expect(found.total).toBe(3);
});

test("an empty search finds nothing", async (context) => {
  const runtime = await createAccounts(context, [
    ["user_one", null],
    ["user_two", null],
    ["user_three", null],
  ]);

  expect(searchAccounts(runtime, "  ")).toStrictEqual({ accounts: [], total: 0 });
  expect(searchAccounts(runtime, "@")).toStrictEqual({ accounts: [], total: 0 });
});
