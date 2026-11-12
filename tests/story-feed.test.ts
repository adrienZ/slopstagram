import { test, type TestContext, expect } from "vitest";
import { createStoryFeed, createReportFeed } from "@@/core/domains/story-feed/story-feed.ts";
import { getStoryDate, getStoryDayRange } from "@@/core/domains/story-feed/story-days.ts";
import { readFeedUserSummaries } from "@@/core/domains/story-feed/feed-user-summary.ts";
import { resolveUserSummariesForReport } from "@@/core/domains/accounts/user-summary.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

async function createFixture(context: TestContext) {
  const runtime = await createTestRuntime(context);
  const { stories, users } = runtime;
  await Promise.all(
    ["alice", "bob", "missing-preview"].map(async (username) => {
      await users.save({ full_name: username, id: username, pk: username, username });
    }),
  );
  await Promise.all(
    [
      { pk: "alice-older", date: "2026-10-21T10:01:00Z", username: "alice" },
      { pk: "alice-newer", date: "2026-10-22T09:00:00Z", username: "alice" },
      { pk: "bob-newest", date: "2026-10-22T09:59:00Z", username: "bob" },
      { pk: "expired", date: "2026-10-21T09:00:00Z", username: "bob" },
      { pk: "no-image", date: "2026-10-22T09:59:30Z", username: "missing-preview" },
    ].map(async ({ pk, date, username }) => {
      await stories.save(
        { pk, taken_at: Date.parse(date) / 1000, media_type: 1 },
        { pk: username, username },
      );
    }),
  );
  return {
    runtime,
    stories,
    dayFeed: (day: string) =>
      createReportFeed(runtime, new Date("2027-01-01T00:00:00Z"), day, { hasPreview: () => true })
        .users,
    feed: (now: string) =>
      createStoryFeed(runtime, new Date(now), { hasPreview: (pk) => pk !== "no-image" }),
  };
}

test("lists distinct sticker kinds across all saved accounts", async (context) => {
  const { stories } = await createFixture(context);
  expect(stories.listStickerKinds()).toStrictEqual([]);
  await stories.save(
    {
      pk: "alice-older",
      annotations: { locations: [], stickers: [{ kind: "mention", label: "@bob" }] },
    },
    { pk: "alice", username: "alice" },
  );
  await stories.save(
    {
      pk: "bob-newest",
      annotations: {
        locations: [],
        stickers: [
          { kind: "mention", label: "@alice" },
          { kind: "poll", label: "Ready?" },
        ],
      },
    },
    { pk: "bob", username: "bob" },
  );
  expect(stories.listStickerKinds()).toStrictEqual(["mention", "poll"]);
});

test("combines stored stories without a selected report, ranks accounts by recency, and plays chronologically", async (context) => {
  const { feed } = await createFixture(context);
  const users = feed("2026-10-22T10:00:00Z");
  expect(
    users.map((user) => ({
      username: user.username,
      stories: user.stories.map((story) => story.media_pk),
    })),
  ).toStrictEqual([
    { username: "bob", stories: ["bob-newest"] },
    { username: "alice", stories: ["alice-older", "alice-newer"] },
  ]);
  expect(feed("2026-10-24T10:00:00Z")).toStrictEqual([]);
});

test("the default feed includes stored stories without checking the preview file", async (context) => {
  const { runtime } = await createFixture(context);
  const users = createStoryFeed(runtime, new Date("2026-10-22T10:00:00Z"));
  expect(
    users.some((user) => user.stories.some((story) => story.media_pk === "no-image")),
  ).toBeTruthy();
});

test("today uses the rolling feed, including yesterday's recent stories; past dates use calendar days", async (context) => {
  const { runtime } = await createFixture(context);
  const now = new Date("2026-10-22T10:00:00Z");
  const options = { hasPreview: (pk: string) => pk !== "no-image" };
  for (const selectedDate of [undefined, "2026-10-22", "2026-10-23"]) {
    const feed = createReportFeed(runtime, now, selectedDate, options);
    expect(feed.selectedDate).toBe("2026-10-22");
    expect(feed.today).toBe("2026-10-22");
    expect(feed.users.flatMap((user) => user.stories.map((story) => story.media_pk))).toStrictEqual(
      ["bob-newest", "alice-older", "alice-newer"],
    );
  }
  const past = createReportFeed(runtime, now, "2026-10-21", options);
  expect(past.selectedDate).toBe("2026-10-21");
  expect(past.users.flatMap((user) => user.stories.map((story) => story.media_pk))).toStrictEqual([
    "alice-older",
    "expired",
  ]);
});

test("available report dates require visible stories and include today for a rolling result from yesterday", async (context) => {
  const { runtime, stories } = await createFixture(context);
  await stories.save(
    { pk: "no-preview", taken_at: Date.parse("2026-10-20T10:00:00Z") / 1000 },
    { pk: "alice", username: "alice" },
  );
  const options = {
    hasPreview: (pk: string) => pk !== "no-preview" && pk !== "no-image",
  };
  const feed = createReportFeed(runtime, new Date("2026-10-24T10:00:00Z"), undefined, options);
  expect(feed.availableDates).toStrictEqual(["2026-10-21", "2026-10-22"]);
  const afterMidnight = createReportFeed(
    runtime,
    new Date("2026-10-22T00:00:00Z"),
    undefined,
    options,
  );
  expect(afterMidnight.availableDates).toStrictEqual(["2026-10-21", "2026-10-22"]);
  expect(
    afterMidnight.users
      .flatMap((user) => user.stories)
      .some((story) => story.media_pk === "alice-older"),
  ).toBeTruthy();
});

test("story deep links retrieve historical stories with exact IDs and select their publication day", async (context) => {
  const { runtime, stories } = await createFixture(context);
  const mediaPk = "3222222222222222229";
  await stories.save(
    { pk: mediaPk, taken_at: Date.parse("2026-09-07T22:30:00Z") / 1000 },
    { pk: "alice", username: "alice" },
  );
  const now = new Date("2026-10-22T10:00:00Z");
  const options = { hasPreview: () => true, selectedStory: mediaPk };
  for (const requestedDate of [undefined, "2026-10-21"]) {
    const feed = createReportFeed(runtime, now, requestedDate, options);
    expect(feed.selectedDate).toBe("2026-09-08");
    expect(
      feed.users.flatMap((user) => user.stories).some((story) => story.media_pk === mediaPk),
    ).toBeTruthy();
  }
  const unknown = createReportFeed(runtime, now, undefined, {
    ...options,
    selectedStory: "missing",
  });
  expect(unknown.selectedDate).toBe("2026-10-22");
});

test("deep links to recent stories retain the rolling feed even when the story was published yesterday", async (context) => {
  const { runtime } = await createFixture(context);
  const now = new Date("2026-10-22T10:00:00Z");
  const options = { hasPreview: () => true };
  const yesterday = createReportFeed(runtime, now, undefined, {
    ...options,
    selectedStory: "alice-older",
  });
  expect(yesterday.selectedDate).toBe("2026-10-22");
  const mismatchedDate = createReportFeed(runtime, now, "2026-10-20", {
    ...options,
    selectedStory: "alice-newer",
  });
  expect(mismatchedDate.selectedDate).toBe("2026-10-22");
  expect(
    mismatchedDate.users
      .flatMap((user) => user.stories)
      .some((story) => story.media_pk === "alice-older"),
  ).toBeTruthy();
});

test("hides a summary after stories expire until a matching summary is generated by a later collection", async (context) => {
  const { feed, runtime } = await createFixture(context);
  const users = feed("2026-10-22T10:00:00Z");
  let generations = 0;
  const options = {
    runUserSummary: async () => {
      generations += 1;
      return JSON.stringify({ summary: "Activités des stories visibles." });
    },
  };
  await resolveUserSummariesForReport(runtime, { output: { users } }, options);
  expect(readFeedUserSummaries(runtime, users).get("alice")).toBe(
    "Activités des stories visibles.",
  );
  const laterUsers = feed("2026-10-22T10:02:00Z");
  const laterView = readFeedUserSummaries(runtime, laterUsers);
  expect(laterView.has("alice")).toBe(false);
  expect(laterView.has("bob")).toBe(true);
  expect(generations).toBe(2);
  await resolveUserSummariesForReport(runtime, { output: { users: laterUsers } }, options);
  expect(generations).toBe(3);
  expect(readFeedUserSummaries(runtime, laterUsers).get("alice")).toBe(
    "Activités des stories visibles.",
  );
});

test("a selected day includes midnight and excludes the next midnight, including the autumn clock change", async (context) => {
  const { stories, dayFeed } = await createFixture(context);
  await Promise.all(
    [
      { pk: "before", date: "2026-10-24T21:59:59Z" },
      { pk: "midnight", date: "2026-10-24T22:00:00Z" },
      { pk: "last-second", date: "2026-10-25T22:59:59Z" },
      { pk: "next-day", date: "2026-10-25T23:00:00Z" },
    ].map(async ({ pk, date }) => {
      await stories.save(
        { pk, taken_at: Date.parse(date) / 1000, media_type: 1 },
        { pk: "alice", username: "alice" },
      );
    }),
  );
  expect(
    dayFeed("2026-10-25").flatMap((user) => user.stories.map((story) => story.media_pk)),
  ).toStrictEqual(["midnight", "last-second"]);
  expect(
    dayFeed("2026-10-26").flatMap((user) => user.stories.map((story) => story.media_pk)),
  ).toStrictEqual(["next-day"]);
  expect(dayFeed("2026-10-27")).toStrictEqual([]);
});

test("story day ranges follow Paris midnight through both daylight-saving changes", () => {
  for (const [day, start, end] of [
    ["2026-03-29", "2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"],
    ["2026-10-25", "2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"],
    ["2026-12-31", "2026-12-30T23:00:00.000Z", "2026-12-31T23:00:00.000Z"],
  ]) {
    const range = getStoryDayRange(day);
    expect(range.start.toISOString()).toBe(start);
    expect(range.end.toISOString()).toBe(end);
  }
  expect(getStoryDate(new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23");
  expect(() => getStoryDayRange("2026-02-30")).toThrow();
});
