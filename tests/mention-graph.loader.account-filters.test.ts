import { expect, test } from "vitest";
import { loadMentionGraph, type MentionGraphPageData } from "../app/loaders/mention-graph.ts";
import { useSharedTestRuntime } from "./setup/test-runtime.ts";
import {
  filterAccount,
  filterAccountStory,
  graphAccounts,
  graphStories,
  laterCleoStories,
  seedFilterGraphDatabase,
} from "./ui/seeded-pages.ts";

const shared = useSharedTestRuntime(seedFilterGraphDatabase);
const [adaGraph, benGraph, cleoGraph] = graphAccounts;
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const eve = `@${filterAccount}`;

function describeConnections({ points, connections }: MentionGraphPageData) {
  const labels = new Map(points.map(({ id, label }) => [id, label]));
  return connections.map(({ source, target }) => [labels.get(source), labels.get(target)]);
}

test("the graph can be filtered by the Accounts it draws, in username order", () => {
  expect(loadMentionGraph(shared.runtime).accounts).toStrictEqual([
    { username: adaGraph, avatarPath: "/media/avatars/700000000000001.jpg" },
    { username: benGraph, avatarPath: "/media/avatars/700000000000062.jpg" },
    { username: cleoGraph, avatarPath: "/media/avatars/700000000000068.jpg" },
    { username: filterAccount, avatarPath: "/media/avatars/700000000000954.jpg" },
  ]);
});

test("filters keep the union of the Accounts' neighborhoods, the stories of what they keep, and every option", () => {
  const graph = loadMentionGraph(shared.runtime, [filterAccount, benGraph]);
  expect(graph.selectedAccounts).toStrictEqual([benGraph, filterAccount]);
  expect(graph.unknownAccounts).toStrictEqual([]);
  expect(graph.accounts).toHaveLength(4);
  expect(describeConnections(graph)).toStrictEqual([
    [cleo, eve],
    [ada, cleo],
    [ben, cleo],
    [ada, ben],
  ]);
  expect(graph.stories.map(({ mediaPk }) => mediaPk).toSorted()).toStrictEqual(
    [
      filterAccountStory,
      ...laterCleoStories,
      graphStories.cleo,
      graphStories.ben,
      graphStories.ada,
    ].toSorted(),
  );
});

test("a username the graph does not draw skips every filter and is reported", () => {
  const unfiltered = loadMentionGraph(shared.runtime);
  const graph = loadMentionGraph(shared.runtime, [benGraph, "nobody_graph", "nobody_graph"]);
  expect(graph).toStrictEqual({
    ...unfiltered,
    selectedAccounts: [],
    unknownAccounts: ["nobody_graph"],
  });
});
