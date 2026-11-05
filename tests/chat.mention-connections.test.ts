import { expect, test } from "vitest";
import { z } from "zod";
import { handleChatRequest } from "../app/routes/api/chat.ts";
import { createWorld, imageStoryPk } from "./setup/report-world.ts";

const ChunkSchema = z.looseObject({ type: z.string() });

async function ask(runtime: Parameters<typeof handleChatRequest>[0], text: string) {
  const response = await handleChatRequest(
    runtime,
    new globalThis.Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "question", role: "user", parts: [{ type: "text", text }] }],
      }),
    }),
  );
  expect(response.status).toBe(200);
  const stream = await response.text();
  return stream.split("\n\n").flatMap((event) => {
    const data = event.replace(/^data: /u, "").trim();
    return data.length === 0 || data === "[DONE]" ? [] : [ChunkSchema.parse(JSON.parse(data))];
  });
}

function outputs(events: Awaited<ReturnType<typeof ask>>) {
  return events.filter(({ type }) => type === "tool-output-available").map(({ output }) => output);
}

test("the Assistant lists observed mention pairs across history and counts each source story once", async (context) => {
  const world = await createWorld(context, {
    editStory: (story) => {
      const username = story.pk === imageStoryPk ? "USER_072" : "user_008";
      story.story_bloks_stickers = [username, username].map((mentioned) => ({
        bloks_sticker: { sticker_data: { ig_mention: { username: mentioned } } },
      }));
    },
  });
  await world.run();
  const events = await ask(world.runtime, "Connections");
  expect(events.filter(({ type }) => type === "tool-input-available")).toMatchObject([
    { toolName: "listMentionConnections", input: {} },
  ]);
  expect(outputs(events)).toMatchObject([
    {
      status: "listed",
      total: 1,
      nextOffset: null,
      connections: [
        { storyCount: 3, source: { username: "user_008" }, target: { username: "user_072" } },
      ],
    },
  ]);
});

test("the Assistant searches separate name-only observations and can find saved accounts without connections", async (context) => {
  const world = await createWorld(context);
  await world.run();
  await world.runtime.users.save({
    pk: "synthetic-isolated",
    id: "synthetic-isolated",
    username: "synthetic_isolated",
    full_name: "Synthetic Isolated",
  });
  // The recordings cannot express name-only mention labels.
  await Promise.all(
    ["synthetic-name-1", "synthetic-name-2"].map(async (pk) => {
      await world.runtime.stories.save(
        {
          pk,
          taken_at: 100,
          annotations: { locations: [], stickers: [{ kind: "mention", label: "Synthetic Guest" }] },
        },
        { pk: "700000000000001", username: "user_008" },
      );
    }),
  );
  const ambiguous = outputs(await ask(world.runtime, "Search connections Synthetic Guest"));
  expect(ambiguous).toMatchObject([
    {
      total: 2,
      requiresClarification: true,
      people: [
        { id: "name:synthetic-name-1:Synthetic%20Guest", kind: "name", connectionCount: 1 },
        { id: "name:synthetic-name-2:Synthetic%20Guest", kind: "name", connectionCount: 1 },
      ],
    },
  ]);
  expect(outputs(await ask(world.runtime, "Search connections SYNTHETIC_ISOLATED"))).toMatchObject([
    {
      total: 1,
      requiresClarification: false,
      people: [{ id: "account:synthetic-isolated", connectionCount: 0 }],
    },
  ]);
});

test("the Assistant returns bounded directional evidence, then distinguishes absent observations and unknown identities", async (context) => {
  const world = await createWorld(context, {
    editStory: (story) => {
      const username = story.pk === imageStoryPk ? "user_072" : "user_008";
      story.story_bloks_stickers = [
        { bloks_sticker: { sticker_data: { ig_mention: { username } } } },
      ];
    },
  });
  await world.run();
  await Promise.all(
    Array.from({ length: 4 }, async (_, index) => {
      await world.runtime.stories.save(
        {
          pk: `synthetic-evidence-${index}`,
          taken_at: 2_000_000_000 + index,
          annotations: {
            locations: [],
            stickers: [
              { kind: "mention", label: "@USER_072" },
              { kind: "mention", label: "@user_072" },
            ],
          },
        },
        { pk: "700000000000001", username: "user_008" },
      );
    }),
  );
  const pair = "account:700000000000001 account:700000000000068";
  const first = outputs(await ask(world.runtime, `Connection ${pair}`));
  expect(first).toMatchObject([{ status: "found", connection: { storyCount: 7 }, nextOffset: 5 }]);
  const read = z
    .object({
      evidence: z.array(
        z.object({
          storyId: z.string(),
          date: z.string().nullable(),
          author: z.object({ username: z.string() }),
          target: z.object({ username: z.string() }),
        }),
      ),
    })
    .parse(first[0]);
  expect(read.evidence).toHaveLength(5);
  expect(read.evidence[0]).toMatchObject({
    storyId: "synthetic-evidence-3",
    date: "2033-05-18T03:33:23.000Z",
    author: { username: "user_008" },
    target: { username: "user_072" },
  });
  const last = outputs(await ask(world.runtime, `Connection ${pair} offset 5`));
  expect(last).toMatchObject([
    {
      status: "found",
      nextOffset: null,
      evidence: [
        { author: { username: "user_072" }, target: { username: "user_008" } },
        { author: { username: "user_008" }, target: { username: "user_072" } },
      ],
    },
  ]);
  await world.runtime.users.save({
    pk: "synthetic-isolated",
    id: "synthetic-isolated",
    username: "synthetic_isolated",
    full_name: null,
  });
  expect(
    outputs(
      await ask(world.runtime, "Connection account:synthetic-isolated account:700000000000001"),
    ),
  ).toMatchObject([{ status: "no_observation" }]);
  expect(
    outputs(await ask(world.runtime, "Connection account:missing account:700000000000001")),
  ).toMatchObject([{ status: "unknown_person", personIds: ["account:missing"] }]);
});

test("the Assistant pages connections and identities and never connects third-party co-mentions", async (context) => {
  const world = await createWorld(context, {
    editStory: (story) => {
      story.story_bloks_stickers =
        story.pk === imageStoryPk
          ? Array.from({ length: 11 }, (_, index) => ({
              bloks_sticker: {
                sticker_data: {
                  ig_mention: { username: `synthetic_guest_${String(index).padStart(2, "0")}` },
                },
              },
            }))
          : [];
    },
  });
  await world.run();
  const first = outputs(await ask(world.runtime, "Connections"));
  expect(first).toMatchObject([{ status: "listed", total: 11, nextOffset: 10 }]);
  expect(z.object({ connections: z.array(z.unknown()) }).parse(first[0]).connections).toHaveLength(
    10,
  );
  expect(outputs(await ask(world.runtime, "Connections offset 10"))).toMatchObject([
    {
      status: "listed",
      total: 11,
      nextOffset: null,
      connections: [{ target: { username: "synthetic_guest_10" } }],
    },
  ]);
  expect(
    outputs(await ask(world.runtime, "Connections of username:synthetic_guest_00")),
  ).toMatchObject([{ status: "listed", total: 1 }]);
  expect(outputs(await ask(world.runtime, "Connections of username:missing"))).toMatchObject([
    { status: "unknown_person", personId: "username:missing" },
  ]);
  const searched = outputs(await ask(world.runtime, "Search connections synthetic_guest"));
  expect(searched).toMatchObject([{ total: 11, nextOffset: 10, requiresClarification: true }]);
  expect(z.object({ people: z.array(z.unknown()) }).parse(searched[0]).people).toHaveLength(10);
  expect(
    outputs(await ask(world.runtime, "Search connections synthetic_guest offset 10")),
  ).toMatchObject([{ total: 11, nextOffset: null, people: [{ username: "synthetic_guest_10" }] }]);
  expect(outputs(await ask(world.runtime, "Search connections missing_person"))).toMatchObject([
    { total: 0, nextOffset: null, requiresClarification: false, people: [] },
  ]);
  expect(
    outputs(
      await ask(
        world.runtime,
        "Connection username:synthetic_guest_00 username:synthetic_guest_01",
      ),
    ),
  ).toMatchObject([{ status: "no_observation" }]);
  expect(
    outputs(
      await ask(world.runtime, "Connection account:700000000000001 username:synthetic_guest_00"),
    ),
  ).toMatchObject([
    {
      status: "found",
      evidence: [
        {
          storyId: imageStoryPk,
          author: { username: "user_008" },
          target: { kind: "username", username: "synthetic_guest_00" },
        },
      ],
    },
  ]);
});

test("a current username collision stays ambiguous in Assistant search instead of assigning its mentions", async (context) => {
  const world = await createWorld(context, {
    editStory: (story) => {
      story.story_bloks_stickers =
        story.pk === imageStoryPk
          ? [{ bloks_sticker: { sticker_data: { ig_mention: { username: "user_072" } } } }]
          : [];
    },
  });
  await world.run();
  await world.runtime.users.save({
    pk: "synthetic-collision",
    id: "synthetic-collision",
    username: "USER_072",
    full_name: "Synthetic Collision",
  });
  expect(outputs(await ask(world.runtime, "Search connections USER_072"))).toMatchObject([
    {
      total: 3,
      requiresClarification: true,
      people: [
        { id: "account:700000000000068", kind: "account", connectionCount: 0 },
        { id: "account:synthetic-collision", kind: "account", connectionCount: 0 },
        {
          id: "username:user_072",
          kind: "ambiguous",
          candidateAccountCount: 2,
          connectionCount: 1,
        },
      ],
    },
  ]);
  expect(
    outputs(await ask(world.runtime, "Connection account:700000000000001 account:700000000000068")),
  ).toMatchObject([{ status: "no_observation" }]);
});
