import { eq, sql } from "drizzle-orm";
import { stories } from "@@/core/domains/database/entities/story.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { createReportFeed } from "@@/core/domains/story-feed/story-feed.ts";
import { resolveUserSummariesForReport } from "@@/core/domains/accounts/user-summary.ts";
import type { SidebarUser } from "../../app/loaders/sidebar-users.ts";
import { withStoryStickers, type StoryCardData } from "../../app/utils/story-cards.ts";
import { groupTimelineLocations } from "../../app/utils/timeline-locations.ts";
import { groupTimelineStickers } from "../../app/utils/timeline-stickers.ts";
import {
  addRecordedReels,
  addRecordedStories,
  editRecordedStories,
  editRecordedUsers,
  keepRecordedStories,
  readRecordedPayloads,
  seedRecordedStories,
} from "../setup/seed.ts";

export const pageNow = new Date("2026-07-26T12:00:00.000Z");
/** Publication of the newest recorded story, before `pageNow`. */
const PUBLISHED_BEFORE_SECONDS = 3600;
/** Moves a recorded story out of the rolling 24 hour feed, onto the previous day. */
const PAST_STORY_AGE_SECONDS = 26 * 3600;
export const today = "2026-07-26";
export const pastDay = "2026-07-25";
export const emptyDay = "2026-07-24";

/** The account whose section comes first in the feed: a display name distinct from its handle. */
export const namedAccount = {
  username: "user_072",
  fullName: "Fixture text 69",
};
/** The account with stories on two days, rendered by the timeline page. */
export const timelineAccount = namedAccount.username;
/** Saved by the application but without any story in the feed. */
export const outsideFeedAccount = "user_901";
/** Saved by the application: the account the first story's mention stickers point at. */
export const mentionedAccount = "user_114";

/** An image story that mentions the saved account above and carries both captions below. */
export const captionedStoryPk = "700000000000107";
/** Published the previous day, so it is only reachable by its day. */
const pastStoryPk = "700000000000116";
export const hostileCaption = "</script><script>caption</script>";
export const appleCaption = "apple <text>";
export const userSummary = "A synthetic summary of the recorded stories.";

/**
 * Seeds a runtime's database with what the page tests render: the recorded stories through
 * production ingestion, plus the accounts, captions and summaries that ingestion does not
 * produce.
 */
export async function seedPageDatabase(runtime: Runtime): Promise<void> {
  await seedRecordedStories(runtime, await readRecordedPayloads(), {
    publishedBefore: { now: pageNow, seconds: PUBLISHED_BEFORE_SECONDS },
  });
  // The recording has neither a markup-laden caption nor a story outside the rolling 24 hours.
  const { database } = runtime;
  database
    .update(stories)
    .set({ accessibilityCaption: hostileCaption })
    .where(eq(stories.mediaPk, captionedStoryPk))
    .run();
  database
    .update(stories)
    .set({ takenAt: sql`${stories.takenAt} - ${PAST_STORY_AGE_SECONDS}` })
    .where(eq(stories.mediaPk, pastStoryPk))
    .run();
  await runtime.appleVision.save(captionedStoryPk, appleCaption);
  for (const [pk, username] of [
    ["700000000000901", outsideFeedAccount],
    ["700000000000114", mentionedAccount],
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Two inserts, saved in order.
    await runtime.users.save({
      full_name: null,
      id: pk,
      pk,
      username,
    });
  }
  await resolveUserSummariesForReport(
    runtime,
    { output: { users: createReportFeed(runtime, pageNow).users } },
    { runUserSummary: async () => await Promise.resolve(JSON.stringify({ summary: userSummary })) },
  );
}

/** The sticker kinds the loader reports for a set of stories: the distinct kinds, alphabetically. */
export function stickerKindsOf(
  entries: Array<{
    story: { annotations?: { stickers: Array<{ kind: string }> } };
  }>,
): Array<string> {
  return [
    ...new Set(
      entries.flatMap(({ story }) => story.annotations?.stickers.map(({ kind }) => kind) ?? []),
    ),
  ].toSorted();
}

/** Recomputes what the loader derives from a timeline's stories, after a test changed them. */
export function regroupTimeline<
  Props extends {
    sidebarUsers: Array<SidebarUser>;
    stories: Array<StoryCardData>;
    timeline: { stories: Array<Parameters<typeof groupTimelineLocations>[0][number]> };
  },
>(props: Props, kinds: Array<string> = stickerKindsOf(props.timeline.stories)) {
  return {
    ...props,
    stories: withStoryStickers(props.stories, props.timeline.stories, props.sidebarUsers),
    stickerGroups: groupTimelineStickers(props.timeline.stories, kinds),
    locations: groupTimelineLocations(props.timeline.stories),
  };
}

/** The recorded accounts, renamed so that each has distinct initials, in recording order. */
export const mapAccounts = ["ada_map", "ben_map", "cleo_map"] as const;
/** A place two accounts tagged: the oldest recorded story, then a newer one of the third account. */
export const sharedPlace = {
  name: "Fixture place 1",
  oldestPk: "700000000000079",
  latestPk: "700000000000903",
};
/** A place only the second account tagged. */
export const soloPlace = { name: "Fixture place 2", pk: "700000000000090" };

/**
 * Seeds a runtime's database with what the map page renders: the recorded stories through
 * production ingestion, with the accounts renamed and location stickers the recording lacks
 * (a shared place, a place of its own, and a place without coordinates). No place lookup is
 * recorded, so the places keep the positions their stickers carry.
 */
export async function seedMapDatabase(runtime: Runtime): Promise<void> {
  const recorded = editRecordedUsers(
    await readRecordedPayloads(["instagram-story-data.json"]),
    (user, position) => {
      user.username = mapAccounts[position] ?? user.username;
    },
  );
  await seedRecordedStories(
    runtime,
    editRecordedStories(recorded, (story) => {
      if (story.pk === sharedPlace.oldestPk) {
        story.story_locations = [
          {
            id: "700000000000912",
            location: { pk: "700000000000930", name: sharedPlace.name, lat: 48.8, lng: 12.5 },
          },
        ];
      }
      if (story.pk === soloPlace.pk) {
        story.story_locations = [
          {
            id: "700000000000913",
            location: { pk: "700000000000940", name: soloPlace.name, lat: 45.1, lng: 5.7 },
          },
          {
            id: "700000000000914",
            location: { pk: "700000000000950", name: "Fixture place without position" },
          },
        ];
      }
    }),
    { publishedBefore: { now: pageNow, seconds: PUBLISHED_BEFORE_SECONDS } },
  );
}

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

function mentionStickers(mentions: Array<{ username?: string; full_name?: string }>) {
  return mentions.map((mention) => ({ bloks_sticker: { sticker_data: { ig_mention: mention } } }));
}

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
    { publishedBefore: { now: pageNow, seconds: PUBLISHED_BEFORE_SECONDS } },
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
