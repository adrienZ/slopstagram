import { expect, test } from "vitest";
import { loadMentionGraph, type MentionGraphPageData } from "../app/loaders/mention-graph.ts";
import { useSharedTestRuntime } from "./setup/test-runtime.ts";
import {
  filterAccount,
  filterAccountStory,
  graphAccounts,
  graphStories,
  cleoStoriesMentioningAda,
  seedFilterGraphDatabase,
  sharedUsername,
} from "./setup/mention-graph-seed.ts";

const shared = useSharedTestRuntime(seedFilterGraphDatabase);
const [adaGraph, benGraph, cleoGraph] = graphAccounts;
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const eve = `@${filterAccount}`;
const twin = `@${sharedUsername}`;

function describeConnections({ graph }: MentionGraphPageData) {
  return graph.connections.map(({ labels }) => labels);
}

test("the graph can be filtered by the usernames of the Accounts it draws, in username order", () => {
  expect(loadMentionGraph(shared.runtime, []).accounts).toStrictEqual([
    { username: adaGraph, avatarPath: "/media/avatars/700000000000001.jpg" },
    { username: benGraph, avatarPath: "/media/avatars/700000000000062.jpg" },
    { username: cleoGraph, avatarPath: "/media/avatars/700000000000068.jpg" },
    { username: filterAccount, avatarPath: "/media/avatars/700000000000954.jpg" },
    // Two Accounts have it: picturing one of them would hide the other.
    { username: sharedUsername, avatarPath: undefined },
  ]);
});

test("filters keep the union of the Accounts' neighborhoods, the stories of what they keep, and every option", () => {
  const graph = loadMentionGraph(shared.runtime, [filterAccount, benGraph]);
  expect(graph.selectedAccounts).toStrictEqual([benGraph, filterAccount]);
  expect(graph.unknownAccounts).toStrictEqual([]);
  expect(graph.accounts).toHaveLength(5);
  expect(describeConnections(graph)).toStrictEqual([
    [cleo, eve],
    [ada, cleo],
    [ben, cleo],
    [ada, ben],
  ]);
  expect(graph.graph.stories.map(({ mediaPk }) => mediaPk).toSorted()).toStrictEqual(
    [
      filterAccountStory,
      ...cleoStoriesMentioningAda,
      graphStories.cleo,
      graphStories.ben,
      graphStories.ada,
    ].toSorted(),
  );
});

test("a username several drawn Accounts share keeps the neighborhoods of all of them", () => {
  const graph = loadMentionGraph(shared.runtime, [sharedUsername]);
  expect(graph.selectedAccounts).toStrictEqual([sharedUsername]);
  expect(graph.graph.points.map(({ label }) => label).toSorted()).toStrictEqual([cleo, twin, twin]);
  expect(describeConnections(graph)).toStrictEqual([
    [cleo, twin],
    [cleo, twin],
  ]);
});

test("a username the graph does not draw, or not in this case, skips every filter and is reported", () => {
  const unfiltered = loadMentionGraph(shared.runtime, []);
  const graph = loadMentionGraph(shared.runtime, [
    benGraph,
    "nobody_graph",
    "nobody_graph",
    adaGraph.toUpperCase(),
  ]);
  expect(graph).toStrictEqual({
    ...unfiltered,
    selectedAccounts: [],
    unknownAccounts: ["nobody_graph", adaGraph.toUpperCase()],
  });
});
