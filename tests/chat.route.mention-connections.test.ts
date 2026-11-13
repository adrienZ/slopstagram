import { expect, test } from "vitest";
import {
  MentionConnectionListSchema,
  MentionConnectionReadSchema,
  type MentionConnectionList,
  type MentionConnectionRead,
} from "@@/core/domains/mention-connections/mention-connection-reads.ts";
import { handleChatRequest } from "../app/routes/api/chat.ts";
import { chatRequest, readChunks, userMessage } from "./setup/chat-stream.ts";
import { assistantAnswer, createWorld } from "./setup/report-world.ts";
import {
  ambiguousUsername,
  graphAccountFullName,
  graphStories,
  laterCleoStories,
  lonelyAccount,
  mentionedName,
  moreCleoStories,
  seedLongConnectionGraphDatabase,
  unknownUsername,
} from "./ui/seeded-pages.ts";

const ada = {
  kind: "account",
  id: "account:700000000000001",
  label: "@ada_graph",
  fullName: graphAccountFullName,
};
const ben = { kind: "account", id: "account:700000000000062", label: "@ben_graph", fullName: null };
const cleo = {
  kind: "account",
  id: "account:700000000000068",
  label: "@cleo_graph",
  fullName: null,
};
const ambiguous = {
  kind: "ambiguous-username",
  id: `username:${ambiguousUsername}`,
  label: `@${ambiguousUsername}`,
  accounts: [`@${ambiguousUsername.toUpperCase()}`, `@${ambiguousUsername}`],
};
const unknown = {
  kind: "unknown-username",
  id: `username:${unknownUsername}`,
  label: `@${unknownUsername}`,
};
/** The same full name, named by a sticker of the third account's story and of the first's. */
const nameOnCleoStory = {
  person: { kind: "name", id: "name:700000000000100:fixture%20name", label: mentionedName },
  connectionCount: 1,
  storyCount: 1,
  latestStoryDate: "2026-07-26T06:38:35.000Z",
  connectedTo: [cleo.label],
};
const nameOnAdaStory = {
  person: { kind: "name", id: "name:700000000000079:fixture%20name", label: mentionedName },
  connectionCount: 1,
  storyCount: 1,
  latestStoryDate: "2026-07-26T02:10:50.000Z",
  connectedTo: [ada.label],
};

/** The graph's connections, with two more stories of the third account mentioning the first. */
async function createMentionWorld(context: Parameters<typeof createWorld>[0]) {
  const world = await createWorld(context);
  await seedLongConnectionGraphDatabase(world.runtime);
  return world;
}

async function ask(world: Awaited<ReturnType<typeof createWorld>>, question: string) {
  return await readChunks(
    await handleChatRequest(world.runtime, chatRequest(userMessage(question))),
  );
}

function storiesOf(read: MentionConnectionRead) {
  return read.status === "found" ? read.stories : [];
}

/** Each listed connection as its two labels, its story count and who mentioned whom. */
function describeListed(list: MentionConnectionList) {
  return list.status === "listed"
    ? list.connections.map(({ people, storyCount, mentions }) => [
        people.map(({ label }) => label),
        storyCount,
        mentions.map(
          ({ author, mentioned, storyCount: count }) => `${author}>${mentioned} ${count}`,
        ),
      ])
    : list;
}

test("asking for the mention connections lists every stored one, whoever mentioned whom", async (context) => {
  const world = await createMentionWorld(context);

  const chunks = await ask(world, "Which mentions?");

  expect(chunks.toolInputs).toStrictEqual([{ input: {}, toolName: "listMentionConnections" }]);
  expect(chunks.toolOutputs).toMatchObject([
    { status: "listed", person: null, total: 8, nextOffset: null },
  ]);
  expect(describeListed(MentionConnectionListSchema.parse(chunks.toolOutputs[0]))).toStrictEqual([
    [[ada.label, cleo.label], 7, ["@cleo_graph>@ada_graph 7"]],
    [[ben.label, cleo.label], 1, ["@cleo_graph>@ben_graph 1"]],
    [[cleo.label, unknown.label], 1, ["@cleo_graph>@unknown_graph 1"]],
    [[cleo.label, mentionedName], 1, ["@cleo_graph>Fixture name 1"]],
    [[cleo.label, ambiguous.label], 1, ["@cleo_graph>@dup_graph 1"]],
    [[ada.label, ben.label], 2, ["@ben_graph>@ada_graph 1", "@ada_graph>@ben_graph 1"]],
    [[ada.label, unknown.label], 1, ["@ada_graph>@unknown_graph 1"]],
    [[ada.label, mentionedName], 1, ["@ada_graph>Fixture name 1"]],
  ]);
  expect(chunks.text).toBe(assistantAnswer);
});

test("the connections of one person put them first, matching their username in any case", async (context) => {
  const world = await createMentionWorld(context);

  const chunks = await ask(world, "Which mentions of @Ada_Graph?");

  expect(chunks.toolInputs).toStrictEqual([
    { input: { person: "@Ada_Graph" }, toolName: "listMentionConnections" },
  ]);
  expect(chunks.toolOutputs).toMatchObject([{ status: "listed", person: ada, total: 4 }]);
  expect(describeListed(MentionConnectionListSchema.parse(chunks.toolOutputs[0]))).toStrictEqual([
    [[ada.label, cleo.label], 7, ["@cleo_graph>@ada_graph 7"]],
    [[ada.label, ben.label], 2, ["@ben_graph>@ada_graph 1", "@ada_graph>@ben_graph 1"]],
    [[ada.label, unknown.label], 1, ["@ada_graph>@unknown_graph 1"]],
    [[ada.label, mentionedName], 1, ["@ada_graph>Fixture name 1"]],
  ]);
});

test("a full name two stories carry asks which one is meant instead of merging them", async (context) => {
  const world = await createMentionWorld(context);

  const listed = await ask(world, `Which mentions of ${mentionedName}?`);
  const read = await ask(world, `Connection ada_graph and ${mentionedName}`);

  const match = { query: mentionedName, candidates: [nameOnCleoStory, nameOnAdaStory], total: 2 };
  expect(listed.toolOutputs).toStrictEqual([{ status: "ambiguous", ...match }]);
  expect(read.toolOutputs).toStrictEqual([{ status: "ambiguous", matches: [match] }]);
});

test("someone no Account or sticker names is unknown, a saved Account never mentioned has no connection", async (context) => {
  const world = await createMentionWorld(context);

  const unknownPerson = await ask(world, "Which mentions of nobody_here?");
  const lonely = await ask(world, `Which mentions of ${lonelyAccount}?`);

  expect(unknownPerson.toolOutputs).toStrictEqual([
    { status: "unknown_person", query: "nobody_here" },
  ]);
  expect(lonely.toolOutputs).toStrictEqual([
    {
      status: "listed",
      person: {
        kind: "account",
        id: "account:700000000000953",
        label: `@${lonelyAccount}`,
        fullName: null,
      },
      connections: [],
      total: 0,
      nextOffset: null,
    },
  ]);
});

test("searching the mentions finds Accounts and name-only observations, each story's name apart", async (context) => {
  const world = await createMentionWorld(context);

  const chunks = await ask(world, "Search mentions FIXTURE");

  expect(chunks.toolInputs).toStrictEqual([
    { input: { query: "FIXTURE" }, toolName: "searchMentionConnections" },
  ]);
  expect(chunks.toolOutputs).toStrictEqual([
    {
      people: [
        nameOnCleoStory,
        nameOnAdaStory,
        {
          person: ada,
          connectionCount: 4,
          storyCount: 9,
          latestStoryDate: "2026-07-26T11:00:00.000Z",
          connectedTo: [cleo.label, ben.label, unknown.label, mentionedName],
        },
      ],
      total: 3,
      nextOffset: null,
    },
  ]);
});

test("reading a connection gives its latest five source stories with who mentioned whom, then the rest", async (context) => {
  const world = await createMentionWorld(context);

  const firstPage = await ask(world, "Connection @cleo_graph and ada_graph");
  const lastPage = await ask(world, "Connection @cleo_graph and ada_graph offset 5");

  expect(firstPage.toolInputs).toStrictEqual([
    {
      input: { firstPerson: "@cleo_graph", secondPerson: "ada_graph" },
      toolName: "getMentionConnection",
    },
  ]);
  expect(firstPage.toolOutputs).toMatchObject([
    {
      status: "found",
      people: [cleo, ada],
      storyCount: 7,
      mentions: [{ author: cleo.label, mentioned: ada.label, storyCount: 7 }],
      nextOffset: 5,
    },
  ]);
  expect(
    storiesOf(MentionConnectionReadSchema.parse(firstPage.toolOutputs[0])).map(
      ({ storyPk }) => storyPk,
    ),
  ).toStrictEqual([...moreCleoStories, ...laterCleoStories.slice(0, 3)]);
  expect(lastPage.toolOutputs).toMatchObject([{ status: "found", nextOffset: null }]);
  expect(storiesOf(MentionConnectionReadSchema.parse(lastPage.toolOutputs[0]))).toStrictEqual([
    {
      storyPk: laterCleoStories[3],
      date: "2026-07-26T10:29:04.000Z",
      author: cleo.label,
      mentioned: ada.label,
    },
    {
      storyPk: graphStories.cleo,
      date: "2026-07-26T06:38:35.000Z",
      author: cleo.label,
      mentioned: ada.label,
    },
  ]);
  expect(firstPage.text).toBe(assistantAnswer);
});

test("reading a connection by an Account's full name keeps each story's direction", async (context) => {
  const world = await createMentionWorld(context);

  const chunks = await ask(world, `Connection ${graphAccountFullName} and @ben_graph`);

  expect(chunks.toolOutputs).toStrictEqual([
    {
      status: "found",
      people: [ada, ben],
      storyCount: 2,
      mentions: [
        { author: ben.label, mentioned: ada.label, storyCount: 1 },
        { author: ada.label, mentioned: ben.label, storyCount: 1 },
      ],
      stories: [
        {
          storyPk: graphStories.ben,
          date: "2026-07-26T04:08:05.000Z",
          author: ben.label,
          mentioned: ada.label,
        },
        {
          storyPk: graphStories.ada,
          date: "2026-07-26T02:10:50.000Z",
          author: ada.label,
          mentioned: ben.label,
        },
      ],
      nextOffset: null,
    },
  ]);
});

test("two people no story connects are no observation, a username several Accounts share stays apart", async (context) => {
  const world = await createMentionWorld(context);

  const shared = await ask(world, `Connection cleo_graph and ${ambiguousUsername}`);
  const none = await ask(world, `Connection ada_graph and ${ambiguousUsername}`);
  const neverSeen = await ask(world, "Connection ben_graph and zed");

  expect(shared.toolOutputs).toMatchObject([
    { status: "found", people: [cleo, ambiguous], storyCount: 1 },
  ]);
  expect(none.toolOutputs).toStrictEqual([{ status: "no_observation", people: [ada, ambiguous] }]);
  expect(neverSeen.toolOutputs).toStrictEqual([{ status: "unknown_person", queries: ["zed"] }]);
});
