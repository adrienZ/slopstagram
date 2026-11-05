import { expect, test } from "vitest";
import { loadMentionGraph } from "../app/loaders/mention-graph.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";
import { eq } from "drizzle-orm";
import { stories } from "@@/core/domains/database/entities/story.ts";
import {
  editRecordedStories,
  editRecordedUsers,
  keepRecordedStories,
  readRecordedPayloads,
  seedRecordedStories,
} from "./setup/seed.ts";

test("the graph joins both mention directions and counts each retained story once", async (context) => {
  const runtime = await createTestRuntime(context);
  const recorded = editRecordedUsers(
    await readRecordedPayloads(["instagram-story-data.json"]),
    (user, position) => {
      user.username = ["ada_graph", "ben_graph", "cleo_graph"][position] ?? user.username;
    },
  );
  await seedRecordedStories(
    runtime,
    editRecordedStories(
      keepRecordedStories(recorded, ["700000000000079", "700000000000090"]),
      (story) => {
        const usernames =
          story.pk === "700000000000079" ? ["BEN_GRAPH", "ben_graph", "ada_graph"] : ["ADA_GRAPH"];
        story.story_bloks_stickers = usernames.map((username) => ({
          bloks_sticker: { sticker_data: { ig_mention: { username } } },
        }));
      },
    ),
  );
  const graph = loadMentionGraph(runtime);
  expect(graph.nodes.map((node) => node.label).toSorted()).toEqual(["@ada_graph", "@ben_graph"]);
  expect(graph.connections).toHaveLength(1);
  expect(graph.connections[0]?.storyCount).toBe(2);
  expect(graph.connections[0]?.storyIds.toSorted()).toEqual(["700000000000079", "700000000000090"]);
  expect(graph.stories.map(({ mediaPk }) => mediaPk).toSorted()).toEqual([
    "700000000000079",
    "700000000000090",
  ]);
  runtime.database.delete(stories).where(eq(stories.mediaPk, "700000000000079")).run();
  expect(loadMentionGraph(runtime).connections[0]?.storyCount).toBe(1);
  runtime.database.delete(stories).where(eq(stories.mediaPk, "700000000000090")).run();
  expect(loadMentionGraph(runtime)).toEqual({ nodes: [], connections: [], stories: [] });
});

test("unknown usernames are shared while name-only observations stay separate and case collisions remain uncertain", async (context) => {
  const runtime = await createTestRuntime(context);
  await Promise.all([
    runtime.users.save({
      pk: "graph-ada",
      id: "graph-ada",
      username: "ada_graph",
      full_name: "Ada Graph",
    }),
    runtime.users.save({
      pk: "graph-ben",
      id: "graph-ben",
      username: "ben_graph",
      full_name: "Ben Graph",
    }),
    runtime.users.save({
      pk: "graph-other",
      id: "graph-other",
      username: "BEN_GRAPH",
      full_name: "Another Graph",
    }),
  ]);
  // The recording has no name-only observations or colliding account usernames.
  await Promise.all(
    ["graph-story-1", "graph-story-2"].map(async (pk, index) => {
      await runtime.stories.save(
        {
          pk,
          taken_at: 100 + index,
          annotations: {
            locations: [],
            stickers: [
              { kind: "mention", label: index === 0 ? "@unknown_graph" : "@UNKNOWN_GRAPH" },
              { kind: "mention", label: "Shared Name" },
              { kind: "mention", label: "@ben_graph" },
            ],
          },
        },
        { pk: "graph-ada", username: "ada_graph" },
      );
    }),
  );
  const graph = loadMentionGraph(runtime);
  expect(graph.nodes.filter(({ kind }) => kind === "username")).toHaveLength(1);
  expect(graph.nodes.filter(({ kind }) => kind === "name")).toHaveLength(2);
  expect(graph.nodes.filter(({ kind }) => kind === "account").map(({ id }) => id)).toEqual([
    "account:graph-ada",
  ]);
  expect(graph.nodes.find(({ kind }) => kind === "ambiguous")).toMatchObject({
    candidateAccountIds: ["account:graph-other", "account:graph-ben"],
  });
  expect(
    graph.connections.map(({ storyCount }) => storyCount).toSorted((left, right) => left - right),
  ).toEqual([1, 1, 2, 2]);
});
