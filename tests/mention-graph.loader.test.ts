import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { stories } from "@@/core/domains/database/entities/story.ts";
import { readMentionConnections } from "@@/core/domains/mention-connections/mention-connections.ts";
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

test("a pair's line counts its distinct stories, whoever mentioned whom and however often", () => {
  const { connections } = readMentionConnections(shared.runtime);
  const pair = connections.find(({ pointIds }) =>
    pointIds.every((id) => ["account:700000000000001", "account:700000000000062"].includes(id)),
  );
  expect(
    pair?.observations.map(({ takenAt: _takenAt, ...observation }) => observation),
  ).toStrictEqual([
    {
      storyPk: graphStories.ben,
      authorId: "account:700000000000062",
      mentionedId: "account:700000000000001",
    },
    {
      storyPk: graphStories.ada,
      authorId: "account:700000000000001",
      mentionedId: "account:700000000000062",
    },
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

test("a username several Accounts share names none of them", () => {
  const { points } = readMentionConnections(shared.runtime);
  expect(points.find(({ id }) => id === `username:${ambiguousUsername}`)).toStrictEqual({
    kind: "ambiguous-username",
    id: `username:${ambiguousUsername}`,
    label: `@${ambiguousUsername}`,
    username: ambiguousUsername,
    accountPks: ["700000000000952", "700000000000951"],
  });
});

test("a connection disappears with the last of its source stories", async (context) => {
  const runtime = await createTestRuntime(context);
  await seedGraphDatabase(runtime);
  runtime.database.delete(stories).where(eq(stories.mediaPk, graphStories.ben)).run();
  expect(describeConnections(loadMentionGraph(runtime))).toContainEqual([ada, ben, 1]);
  runtime.database.delete(stories).where(eq(stories.mediaPk, graphStories.ada)).run();
  expect(describeConnections(loadMentionGraph(runtime))).toStrictEqual([
    [ada, cleo, 1],
    [ben, cleo, 1],
    [cleo, unknown, 1],
    [cleo, mentionedName, 1],
    [cleo, ambiguous, 1],
  ]);
  runtime.database.delete(stories).where(eq(stories.mediaPk, graphStories.cleo)).run();
  expect(loadMentionGraph(runtime)).toStrictEqual({ points: [], connections: [] });
});
