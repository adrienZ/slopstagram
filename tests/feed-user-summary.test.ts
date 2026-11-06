import { expect, test } from "vitest";
import { readFeedUserSummary } from "@@/core/domains/story-feed/feed-user-summary.ts";
import { loadStoryFeed } from "@/loaders/story-feed.ts";
import { createWorld, now } from "@@/tests/setup/report-world.ts";

test("reads the user summary the story feed shows, ignoring an @ prefix and letter case", async (context) => {
  const world = await createWorld(context);
  await world.run();

  const feedSummaries = loadStoryFeed(world, now).users.map(({ user, summary }) => ({
    summary,
    username: user.username,
  }));
  expect(feedSummaries).toStrictEqual([
    { summary: "Summary of user_072", username: "user_072" },
    { summary: "Summary of user_008", username: "user_008" },
  ]);
  expect(readFeedUserSummary(world, "@User_072", now)).toStrictEqual({
    status: "found",
    storyCount: 2,
    summary: "Summary of user_072",
    username: "user_072",
  });
  expect(readFeedUserSummary(world, "user_008", now)).toStrictEqual({
    status: "found",
    storyCount: 1,
    summary: "Summary of user_008",
    username: "user_008",
  });
});

test("an unsaved username is an unknown account", async (context) => {
  const world = await createWorld(context);
  await world.run();

  expect(readFeedUserSummary(world, "@user_999", now)).toStrictEqual({
    error: "unknown_account",
    status: "error",
  });
});

test("an account whose stories left the last 24 hours has no summary to show", async (context) => {
  const world = await createWorld(context);
  await world.run();
  const nextDay = new Date(now.getTime() + 24 * 3600 * 1000);

  expect(loadStoryFeed(world, nextDay).users).toStrictEqual([]);
  expect(readFeedUserSummary(world, "user_008", nextDay)).toStrictEqual({
    reason: "no_stories_in_last_24h",
    status: "missing",
    username: "user_008",
  });
});

test("an account whose summary the fetch run could not generate gets none, and the read never asks Ollama", async (context) => {
  const world = await createWorld(context, { ollama: { summary: "server-error" } });
  await world.run();
  const requests = world.ollama.requests.length;

  expect(loadStoryFeed(world, now).users.map(({ summary }) => summary)).toStrictEqual([
    undefined,
    undefined,
  ]);
  expect(readFeedUserSummary(world, "user_072", now)).toStrictEqual({
    reason: "not_generated",
    status: "missing",
    username: "user_072",
  });
  expect(world.ollama.requests).toHaveLength(requests);
});
