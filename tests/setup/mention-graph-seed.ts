import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import {
  addRecordedReels,
  addRecordedStories,
  editRecordedStories,
  editRecordedUsers,
  keepRecordedStories,
  mentionStickers,
  readRecordedPayloads,
  seedRecordedStories,
} from "./seed.ts";

/** The recording's stories are from 2026-07-26: seeded an hour later, they are all published. */
const RECORDED_STORIES_PUBLISHED = { now: new Date("2026-07-26T12:00:00.000Z"), seconds: 3600 };

/** The recorded accounts of one reels page, renamed, with a full name only the first has. */
export const graphAccounts = ["ada_graph", "ben_graph", "cleo_graph"] as const;
export const graphAccountFullName = "Ada Fixture";

/**
 * Accounts the recording lacks, ingested with one sticker-free story each: two whose usernames
 * differ only in case, and one alone.
 */
export const ambiguousUsername = "dup_graph";
export const lonelyAccount = "lone_graph";
export const unknownUsername = "unknown_graph";
export const mentionedName = "Fixture name";

/** The stories of the graph, oldest first: one per account. */
export const graphStories = {
  ada: "700000000000079",
  ben: "700000000000090",
  cleo: "700000000000100",
} as const;

export const cleoStoryMentioningAdaTwice = "700000000000107";

/** Newest first. */
export const cleoStoriesMentioningAda = [
  "700000000000129",
  "700000000000122",
  "700000000000116",
  cleoStoryMentioningAdaTwice,
] as const;

const [adaGraph, benGraph] = graphAccounts;

const mentionsByStory = new Map<string, ReturnType<typeof mentionStickers>>([
  [
    graphStories.ada,
    mentionStickers([
      { username: benGraph.toUpperCase() },
      { username: benGraph },
      { username: "Ada_Graph" },
      { username: unknownUsername },
      { full_name: mentionedName },
    ]),
  ],
  [graphStories.ben, mentionStickers([{ username: adaGraph }])],
  [
    graphStories.cleo,
    mentionStickers([
      { username: adaGraph },
      { username: benGraph },
      { username: unknownUsername.toUpperCase() },
      { full_name: mentionedName },
      { username: ambiguousUsername },
    ]),
  ],
  [cleoStoriesMentioningAda[0], mentionStickers([{ username: adaGraph }])],
  [cleoStoriesMentioningAda[1], mentionStickers([{ username: adaGraph }])],
  [cleoStoriesMentioningAda[2], mentionStickers([{ username: adaGraph }])],
  [
    cleoStoryMentioningAdaTwice,
    mentionStickers([{ username: adaGraph }, { username: adaGraph.toUpperCase() }]),
  ],
]);

type GraphReel = Parameters<typeof addRecordedReels>[1][number];

const extraGraphReels: Array<GraphReel> = [
  { userPk: "700000000000951", username: ambiguousUsername, storyPk: "700000000000961" },
  {
    userPk: "700000000000952",
    username: ambiguousUsername.toUpperCase(),
    storyPk: "700000000000962",
  },
  { userPk: "700000000000953", username: lonelyAccount, storyPk: "700000000000963" },
];

interface GraphSeedOptions {
  storyPks?: Array<string>;
  /** The accounts the recording lacks, each with one story. */
  reels?: Array<GraphReel>;
  /** Copies of a recorded account's first story. */
  addedStories?: Parameters<typeof addRecordedStories>[1];
  undatedStoryPks?: Array<string>;
}

async function seedGraphWithMentions(
  runtime: Runtime,
  mentions: Map<string, ReturnType<typeof mentionStickers>>,
  {
    storyPks = [...mentions.keys()],
    reels,
    addedStories = [],
    undatedStoryPks = [],
  }: GraphSeedOptions & Required<Pick<GraphSeedOptions, "reels">>,
): Promise<void> {
  const recorded = editRecordedUsers(
    addRecordedStories(
      addRecordedReels(await readRecordedPayloads(["instagram-story-data.json"]), reels),
      addedStories,
    ),
    (user, position) => {
      user.username = graphAccounts[position] ?? user.username;

      if (position === 0) {
        user.full_name = graphAccountFullName;
      }
    },
  );

  const keptStoryPks = [...storyPks, ...[...reels, ...addedStories].map(({ storyPk }) => storyPk)];
  await seedRecordedStories(
    runtime,
    editRecordedStories(keepRecordedStories(recorded, keptStoryPks), (story) => {
      story.story_bloks_stickers = mentions.get(story.pk) ?? [];

      if (undatedStoryPks.includes(story.pk)) {
        delete story.taken_at;
      }
    }),
    { publishedBefore: RECORDED_STORIES_PUBLISHED },
  );
}

/**
 * Seeds a runtime's database with what the mention graph shows: one story per recorded account
 * through production ingestion, with the mention stickers the recording lacks. The first account
 * mentions the second twice, in another case, then itself, an unknown username and a name; the
 * second mentions the first back; the third mentions both, the unknown username in upper case,
 * the same name, and a username two ingested Accounts share.
 */
export async function seedGraphDatabase(
  runtime: Runtime,
  storyPks: Array<string> = [...mentionsByStory.keys()],
  { reels = [], ...options }: Omit<GraphSeedOptions, "storyPks"> = {},
): Promise<void> {
  await seedGraphWithMentions(runtime, mentionsByStory, {
    ...options,
    storyPks,
    reels: [...extraGraphReels, ...reels],
  });
}

/** An Account only a newer story of the third account mentions. */
export const filterAccount = "eve_graph";

/** That newer story of the third account, which the plain graph leaves out. */
export const filterAccountStory = "700000000000900";

/**
 * Two Accounts with exactly this username, each mentioning the third account. A fetch groups its
 * reels by username, so the second one comes from a later fetch, as when a username changes hands.
 */
export const sharedUsername = "twin_graph";

/**
 * Seeds the graph of `seedGraphDatabase` plus one Account whose only neighbor is the third
 * account, so that two filtered neighborhoods differ: the second account's holds the first and
 * the third, this Account's only the third. Two more Accounts share a username exactly.
 */
export async function seedFilterGraphDatabase(runtime: Runtime): Promise<void> {
  const [firstTwin, secondTwin] = [
    { userPk: "700000000000955", username: sharedUsername, storyPk: "700000000000965" },
    { userPk: "700000000000956", username: sharedUsername, storyPk: "700000000000966" },
  ];

  const mentionsThirdAccount = mentionStickers([{ username: graphAccounts[2] }]);
  await seedGraphWithMentions(
    runtime,
    new Map([
      ...mentionsByStory,
      [filterAccountStory, mentionStickers([{ username: filterAccount }])],
      [firstTwin.storyPk, mentionsThirdAccount],
    ]),
    {
      reels: [
        ...extraGraphReels,
        { userPk: "700000000000954", username: filterAccount, storyPk: "700000000000964" },
        firstTwin,
      ],
    },
  );
  await seedGraphWithMentions(runtime, new Map([[secondTwin.storyPk, mentionsThirdAccount]]), {
    storyPks: [],
    reels: [secondTwin],
  });
}

/** Two more stories of the third account, each mentioning the first account only. */
export const moreCleoStories = ["700000000000906", "700000000000903"] as const;

/**
 * Seeds the graph of `seedGraphDatabase` with two more stories of the third account mentioning
 * the first, so that their connection has more source stories than a read of it gives at once.
 */
export async function seedLongConnectionGraphDatabase(runtime: Runtime): Promise<void> {
  await seedGraphWithMentions(
    runtime,
    new Map([
      ...mentionsByStory,
      ...moreCleoStories.map((pk) => [pk, mentionStickers([{ username: adaGraph }])] as const),
    ]),
    { reels: extraGraphReels },
  );
}
