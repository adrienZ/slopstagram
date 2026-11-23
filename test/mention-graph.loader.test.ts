import { expect, test, type TestContext } from "vitest";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { loadMentionGraph, type MentionGraphPageData } from "../app/loaders/mention-graph.ts";
import { createTestRuntime, shareTestRuntime } from "./setup/test-runtime.ts";
import {
  ambiguousUsername,
  graphAccountFullName,
  graphAccounts,
  graphStories,
  cleoStoriesMentioningAda,
  lonelyAccount,
  mentionedName,
  seedGraphDatabase,
  unknownUsername,
} from "./setup/mention-graph-seed.ts";

const shared = shareTestRuntime(seedGraphDatabase);
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const unknown = `@${unknownUsername}`;
const ambiguous = `@${ambiguousUsername} (plusieurs comptes)`;

function loadGraph(runtime: Runtime): MentionGraphPageData["graph"] {
  return loadMentionGraph(runtime, []).graph;
}

function describeConnections({ connections }: MentionGraphPageData["graph"]) {
  return connections.map(({ labels, storyPks }) => [...labels, storyPks.length]);
}

test("connects each story's author to whom its stickers name, one line per pair", () => {
  // Newest story first: the third account's, then the second's, then the first's.
  expect(describeConnections(loadGraph(shared.runtime))).toStrictEqual([
    [ada, cleo, 5],
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
  const points = loadGraph(shared.runtime).points.map(({ x: _x, y: _y, ...point }) => point);
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
  await seedGraphDatabase(runtime, undefined, {
    reels: [
      {
        userPk: "700000000000957",
        username: graphAccounts[0].toUpperCase(),
        storyPk: "700000000000967",
      },
    ],
  });
  const sharedAda = `${ada} (plusieurs comptes)`;
  const connections = describeConnections(loadGraph(runtime));
  expect(connections).toContainEqual([ben, sharedAda, 1]);
  expect(connections).not.toContainEqual([ada, sharedAda, 1]);
});

const graphAuthorPks = ["700000000000001", "700000000000062", "700000000000068"];

/**
 * Only some of the graph's stories stored. Each author also keeps a story that mentions nobody,
 * so ingestion still stores them as known Accounts.
 */
async function seedGraphStories(
  context: TestContext,
  storyPks: Array<string>,
  options: { undatedStoryPks?: Array<string> } = {},
): Promise<Runtime> {
  const runtime = await createTestRuntime(context);
  await seedGraphDatabase(runtime, storyPks, {
    ...options,
    addedStories: graphAuthorPks.map((userPk, position) => ({
      userPk,
      storyPk: `70000000000097${position}`,
    })),
  });

  return runtime;
}

test("a connection lasts only as long as one of its source stories is stored", async (context) => {
  const withoutBen = await seedGraphStories(context, [
    graphStories.ada,
    graphStories.cleo,
    ...cleoStoriesMentioningAda,
  ]);

  expect(describeConnections(loadGraph(withoutBen))).toContainEqual([ada, ben, 1]);

  const onlyCleo = await seedGraphStories(context, [
    graphStories.cleo,
    ...cleoStoriesMentioningAda,
  ]);

  const graph = loadGraph(onlyCleo);
  expect(graph.stories.map(({ mediaPk }) => mediaPk).toSorted()).toStrictEqual(
    [graphStories.cleo, ...cleoStoriesMentioningAda].toSorted(),
  );
  expect(describeConnections(graph)).toStrictEqual([
    [ada, cleo, 5],
    [ben, cleo, 1],
    [cleo, unknown, 1],
    [cleo, mentionedName, 1],
    [cleo, ambiguous, 1],
  ]);
});

test("a connection's source stories are those where one end mentioned the other, each once", () => {
  const { connections } = loadGraph(shared.runtime);
  expect(connections.map(({ labels, storyPks }) => [...labels, storyPks])).toStrictEqual([
    [ada, cleo, [...cleoStoriesMentioningAda, graphStories.cleo]],
    [ben, cleo, [graphStories.cleo]],
    [cleo, unknown, [graphStories.cleo]],
    [cleo, mentionedName, [graphStories.cleo]],
    [cleo, ambiguous, [graphStories.cleo]],
    [ada, ben, [graphStories.ben, graphStories.ada]],
    [ada, unknown, [graphStories.ada]],
    [ada, mentionedName, [graphStories.ada]],
  ]);
});

test("every source story comes with its card, previewed through the Media store", () => {
  const { stories: cards } = loadGraph(shared.runtime);
  expect(cards.map(({ mediaPk }) => mediaPk).toSorted()).toStrictEqual(
    [...Object.values(graphStories), ...cleoStoriesMentioningAda].toSorted(),
  );
  expect(cards.find(({ mediaPk }) => mediaPk === graphStories.ben)).toMatchObject({
    username: graphAccounts[1],
    preview: `/media/story-previews/${graphStories.ben}.jpg`,
    avatar: "/media/avatars/700000000000062.jpg",
  });
});

test("an undated story, which no page can show, is no source story", async (context) => {
  const runtime = await seedGraphStories(context, [graphStories.ada, graphStories.ben], {
    undatedStoryPks: [graphStories.ben],
  });

  const graph = loadGraph(runtime);
  expect(describeConnections(graph)).toContainEqual([ada, ben, 1]);
  expect(graph.stories.map(({ mediaPk }) => mediaPk)).toStrictEqual([graphStories.ada]);
});

test("lays every point out once, identically each time the same graph is loaded", () => {
  const { points } = loadGraph(shared.runtime);
  expect(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  expect(new Set(points.map(({ x, y }) => `${x} ${y}`)).size).toBe(points.length);
  expect(loadGraph(shared.runtime).points).toStrictEqual(points);
});

test("lays a filtered graph out on its own, not as part of the whole graph", () => {
  const whole = loadGraph(shared.runtime).points;
  const filtered = loadMentionGraph(shared.runtime, [graphAccounts[1]]).graph.points;
  const [kept] = filtered;
  expect(filtered.length).toBeLessThan(whole.length);
  expect(whole.find(({ id }) => id === kept.id)).not.toStrictEqual(kept);
});
