import { expect, test, type TestContext } from "vitest";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { loadMentionGraph, type MentionGraphPageData } from "../app/loaders/mention-graph.ts";
import { createTestRuntime, useSharedTestRuntime } from "./setup/test-runtime.ts";
import {
  ambiguousUsername,
  graphAccountFullName,
  graphAccounts,
  graphStories,
  lonelyAccount,
  mentionedName,
  seedGraphDatabase,
  unknownUsername,
} from "./ui/seeded-pages.ts";

const shared = useSharedTestRuntime(seedGraphDatabase);
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const unknown = `@${unknownUsername}`;
const ambiguous = `@${ambiguousUsername} (plusieurs comptes)`;

/** Each connection as its two labels, in the loader's order, and its story count. */
function describeConnections({ points, connections }: MentionGraphPageData) {
  const labels = new Map(points.map(({ id, label }) => [id, label]));
  return connections.map(({ source, target, storyCount }) => [
    labels.get(source),
    labels.get(target),
    storyCount,
  ]);
}

test("connects each story's author to whom its stickers name, one line per pair", () => {
  // Newest story first: the third account's, then the second's, then the first's.
  expect(describeConnections(loadMentionGraph(shared.runtime))).toStrictEqual([
    [ada, cleo, 1],
    [ben, cleo, 1],
    [cleo, unknown, 1],
    [cleo, mentionedName, 1],
    [cleo, ambiguous, 1],
    [ada, ben, 2],
    [ada, unknown, 1],
    [ada, mentionedName, 1],
  ]);
});

test("shows only connected points: Accounts with their profile, anyone else as a label", () => {
  const { points } = loadMentionGraph(shared.runtime);
  expect(points).toStrictEqual([
    {
      kind: "account",
      id: "account:700000000000068",
      label: cleo,
      username: graphAccounts[2],
      fullName: null,
      avatarPath: "/media/avatars/700000000000068.jpg",
    },
    {
      kind: "account",
      id: "account:700000000000001",
      label: ada,
      username: graphAccounts[0],
      fullName: graphAccountFullName,
      avatarPath: "/media/avatars/700000000000001.jpg",
    },
    {
      kind: "account",
      id: "account:700000000000062",
      label: ben,
      username: graphAccounts[1],
      fullName: null,
      avatarPath: "/media/avatars/700000000000062.jpg",
    },
    { kind: "unknown", id: `username:${unknownUsername}`, label: unknown },
    { kind: "unknown", id: "name:700000000000100:fixture%20name", label: mentionedName },
    { kind: "unknown", id: `username:${ambiguousUsername}`, label: ambiguous },
    { kind: "unknown", id: "name:700000000000079:fixture%20name", label: mentionedName },
  ]);
  expect(points.map(({ label }) => label)).not.toContain(`@${lonelyAccount}`);
});

test("an author naming their own username makes no connection, even when another Account shares it", async (context) => {
  const runtime = await createTestRuntime(context);
  await seedGraphDatabase(runtime);
  await runtime.users.save({
    full_name: null,
    id: "700000000000954",
    pk: "700000000000954",
    username: graphAccounts[0].toUpperCase(),
  });
  const sharedAda = `${ada} (plusieurs comptes)`;
  const connections = describeConnections(loadMentionGraph(runtime));
  expect(connections).toContainEqual([ben, sharedAda, 1]);
  expect(connections).not.toContainEqual([ada, sharedAda, 1]);
});

const graphAuthorPks = { ada: "700000000000001", ben: "700000000000062", cleo: "700000000000068" };

/** Only some of the graph's stories stored, every author still a known Account. */
async function seedGraphStories(
  context: TestContext,
  kept: Array<keyof typeof graphStories>,
): Promise<Runtime> {
  const runtime = await createTestRuntime(context);
  await seedGraphDatabase(
    runtime,
    kept.map((name) => graphStories[name]),
  );
  const leftOut = Object.entries(graphAuthorPks).filter(
    ([name]) => !kept.some((keptName) => keptName === name),
  );
  await Promise.all(
    leftOut.map(async ([name, pk]) => {
      await runtime.users.save({ full_name: null, id: pk, pk, username: `${name}_graph` });
    }),
  );
  return runtime;
}

test("a connection lasts only as long as one of its source stories is stored", async (context) => {
  const withoutBen = await seedGraphStories(context, ["ada", "cleo"]);
  expect(describeConnections(loadMentionGraph(withoutBen))).toContainEqual([ada, ben, 1]);

  const onlyCleo = await seedGraphStories(context, ["cleo"]);
  expect(describeConnections(loadMentionGraph(onlyCleo))).toStrictEqual([
    [ada, cleo, 1],
    [ben, cleo, 1],
    [cleo, unknown, 1],
    [cleo, mentionedName, 1],
    [cleo, ambiguous, 1],
  ]);
});
