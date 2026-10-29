import { readFile } from "node:fs/promises";
import path from "node:path";
import { assert, expect, test } from "vitest";
import { AppleOcrUnavailableError } from "../sdk/lib/apple-ocr-service.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";
import { createStoryFeed, readStoryFeedVision } from "../sdk/story-feed.ts";
import { readUserSummaries } from "../sdk/user-summary.ts";
import { createFailingSession, createRecordedSession } from "./instagram-session.ts";
import { createRecordedInstagramClient } from "./setup/seed.ts";
import {
  audioAssetId,
  audioUrl,
  createWorld,
  imageStoryPk,
  musicStoryPk,
  now,
  placeId,
  publishedBefore,
  recordedPayloads,
  storyPks,
  trayBody,
} from "./report-world.ts";

test("creates a report by running the whole pipeline over recorded Instagram payloads", async (context) => {
  const world = await createWorld(context);

  const result = await world.run();

  const [run] = world.runs.list();
  expect(world.runs.list()).toHaveLength(1);
  expect(run).toMatchObject({
    failedCount: 0,
    fetchedCount: 3,
    reelsCount: 2,
    reportKey: result.reportKey,
    status: "succeeded",
    storiesCount: 3,
  });
  expect(run.error).toBeNull();
  expect(world.users.listAll().map(({ username }) => username)).toStrictEqual([
    "user_008",
    "user_072",
  ]);

  // Tray, story reels, parsing and stickers.
  const image = world.stories.findByMediaPk(imageStoryPk);
  expect(image?.media_type).toBe(1);
  expect(image?.annotations?.stickers.length).toBeGreaterThan(0);

  // Tagged place lookup.
  const places = image?.annotations?.locationObservations?.map(({ metadata }) => metadata) ?? [];
  expect(places.find(({ instagramPlaceId }) => instagramPlaceId === placeId)).toMatchObject({
    address: "1 Synthetic Street",
    category: "Cafe",
    city: "Syntheville",
    lastLookupFailure: null,
    name: "Synthetic Cafe",
    status: "usable",
  });
  expect(image?.annotations?.locations).toStrictEqual(["Synthetic Cafe"]);

  // Music asset lookup, then audio and artwork caching.
  const musicObservations =
    world.stories.findByMediaPk(musicStoryPk)?.annotations?.musicObservations ?? [];
  expect(musicObservations).toHaveLength(1);
  const [music] = musicObservations;
  expect(music.metadata).toMatchObject({
    artist: "Synthetic Artist",
    audioSourceUrl: audioUrl,
    audioState: "available",
    instagramAudioAssetId: audioAssetId,
    title: "Synthetic Song",
  });
  assert.ok(music.metadata.audioCachePath !== null);
  const audioFile = await readFile(path.join(world.cacheDirectory, music.metadata.audioCachePath));
  expect(audioFile.byteLength).toBeGreaterThan(0);

  // Image caching: every preview and avatar lands in the cache and the report points at it.
  const saved = world.reports.findByKey(result.reportKey);
  assert.ok(saved);
  const savedStories = saved.output.users.flatMap((user) => user.stories);
  expect(savedStories.map((story) => story.media_pk).toSorted()).toStrictEqual(storyPks);
  await Promise.all(
    savedStories.map(async (story) => {
      expect(story.preview_image_url).toBe(`images/story-previews/${story.media_pk}.jpg`);
      const file = await readFile(path.join(world.cacheDirectory, story.preview_image_url ?? ""));
      expect(file.length).toBeGreaterThan(0);
    }),
  );
  await Promise.all(
    world.users.listAll().map(async ({ pk }) => {
      const avatar = await readFile(path.join(world.cacheDirectory, `images/avatars/${pk}.jpg`));
      expect(avatar.length).toBeGreaterThan(0);
    }),
  );

  // Audio is cached before any image is downloaded.
  const firstImage = world.calls.findIndex((call) => call.startsWith("image "));
  expect(world.calls.indexOf(`media ${audioUrl}`)).toBeLessThan(firstImage);

  // Apple captions and vision analysis, one per story, in report order.
  const order = savedStories.map((story) => story.media_pk);
  for (const [position, mediaPk] of order.entries()) {
    expect(world.appleVision.findByMediaPk(mediaPk)).toBe(`Synthetic caption ${position}`);
    expect(world.vision.findByMediaPk(mediaPk)?.result).toStrictEqual({
      text: `Synthetic sign ${position}`,
      visual: `Synthetic scene ${position}`,
    });
  }

  // User summaries, written from the stored vision analyses.
  const feed = createStoryFeed(now, { repository: world.stories });
  const summaries = readUserSummaries(feed, {
    repository: world.summaries,
    visionByPreviewUrl: readStoryFeedVision(feed, world.vision),
  });
  expect(Object.fromEntries(summaries)).toStrictEqual({
    user_008: "Summary of user_008",
    user_072: "Summary of user_072",
  });
  expect(world.ollama.requests.filter(({ kind }) => kind === "summary")).toHaveLength(2);
  expect(world.ollama.requests.filter(({ kind }) => kind === "vision")).toHaveLength(3);
});

test("records a failed vision analysis and still completes the run", async (context) => {
  const world = await createWorld(context, {
    ollama: { vision: (position) => (position === 1 ? "server-error" : undefined) },
  });

  const result = await world.run();

  expect(world.runs.list()[0].status).toBe("succeeded");
  const order = world.reports
    .findByKey(result.reportKey)
    ?.output.users.flatMap((user) => user.stories.map((story) => story.media_pk));
  assert.ok(order);
  expect(world.vision.findByMediaPk(order[0])?.result.visual).toBe("Synthetic scene 0");
  // The failure is not stored as an analysis, so the next run tries the story again.
  expect(world.vision.findByMediaPk(order[1])).toBeNull();
  expect(world.vision.findByMediaPk(order[2])?.result.visual).toBe("Synthetic scene 2");
  // The rest of the pipeline went on: captions and summaries do not depend on it.
  expect(order.map((mediaPk) => world.appleVision.findByMediaPk(mediaPk))).toStrictEqual([
    "Synthetic caption 0",
    "Synthetic caption 1",
    "Synthetic caption 2",
  ]);
  const feed = createStoryFeed(now, { repository: world.stories });
  expect(
    readUserSummaries(feed, {
      repository: world.summaries,
      visionByPreviewUrl: readStoryFeedVision(feed, world.vision),
    }).size,
  ).toBe(2);
});

test("records an unreachable vision server in the log and completes the run", async (context) => {
  const world = await createWorld(context, {
    ollama: { summary: "unreachable", vision: () => "unreachable" },
  });

  const result = await world.run();

  expect(world.runs.list()[0].status).toBe("succeeded");
  for (const story of world.reports
    .findByKey(result.reportKey)
    ?.output.users.flatMap((user) => user.stories) ?? []) {
    expect(world.vision.findByMediaPk(story.media_pk)).toBeNull();
  }
  expect(
    world.logger.messages.filter((line) => line.startsWith("warn: vision unavailable")),
  ).toHaveLength(3);
  expect(
    world.logger.messages.filter((line) => line.startsWith("warn: could not summarize user")),
  ).toHaveLength(2);
  expect(world.summaries.findBySourceHash("unknown")).toBeNull();
  const feed = createStoryFeed(now, { repository: world.stories });
  expect(readUserSummaries(feed, { repository: world.summaries }).size).toBe(0);
});

test("skips the remaining captions when Apple OCR is unavailable", async (context) => {
  const world = await createWorld(context, {
    ocr: () => new AppleOcrUnavailableError("unsupported platform linux"),
  });

  const result = await world.run();

  expect(world.runs.list()[0].status).toBe("succeeded");
  expect(world.calls.filter((call) => call === "ocr")).toHaveLength(1);
  const mediaPks =
    world.reports
      .findByKey(result.reportKey)
      ?.output.users.flatMap((user) => user.stories.map((story) => story.media_pk)) ?? [];
  expect(mediaPks).toHaveLength(3);
  for (const mediaPk of mediaPks) {
    expect(world.appleVision.findByMediaPk(mediaPk)).toBeNull();
    // Vision analysis still runs.
    expect(world.vision.findByMediaPk(mediaPk)).not.toBeNull();
  }
  expect(world.logger.messages).toContain(
    "warn: apple ocr unavailable; skipping remaining captions: unsupported platform linux",
  );
});

test("keeps captioning the other stories when Apple OCR fails on one", async (context) => {
  const world = await createWorld(context, {
    ocr: (position) =>
      position === 0 ? new Error("unreadable image") : `Synthetic caption ${position}`,
  });

  const result = await world.run();

  expect(world.runs.list()[0].status).toBe("succeeded");
  const mediaPks =
    world.reports
      .findByKey(result.reportKey)
      ?.output.users.flatMap((user) => user.stories.map((story) => story.media_pk)) ?? [];
  expect(mediaPks.map((mediaPk) => world.appleVision.findByMediaPk(mediaPk))).toStrictEqual([
    null,
    "Synthetic caption 1",
    "Synthetic caption 2",
  ]);
  expect(world.logger.messages.some((line) => line.includes("apple ocr failed for story"))).toBe(
    true,
  );
});

test("stores an empty caption as not available", async (context) => {
  const world = await createWorld(context, { ocr: () => "  \n" });

  const result = await world.run();

  const [first] = world.reports.findByKey(result.reportKey)?.output.users[0].stories ?? [];
  expect(world.appleVision.findByMediaPk(first.media_pk)).toBe("N/A");
});

test("records a failed fetch attempt even when Instagram returns no tray", async (context) => {
  let time = now;
  const world = await createWorld(context, { client: undefined });
  const client = createInstagramClient(
    createFailingSession(401, () => {
      expect(world.runs.list()[0].status).toBe("running");
      expect(world.runs.list()[0].startedAt).toBe("2026-10-29T12:00:00.000Z");
      time = new Date("2026-10-29T12:00:03Z");
    }),
  );

  await expect(world.run({ client }, () => time)).rejects.toThrow(/HTTP 401/u);

  const [run] = world.runs.list();
  expect(run.status).toBe("failed");
  expect(run.finishedAt).toBe("2026-10-29T12:00:03.000Z");
  expect(run.error).toBe("Instagram request failed with HTTP 401");
  expect(run.storiesCount).toBeNull();
  expect(run.reportKey).toBeNull();
  expect(world.reports.listKeys()).toStrictEqual([]);
});

test("preserves a totally failed observation and its errors before rejecting the fetch", async (context) => {
  const world = await createWorld(context);
  const client = createInstagramClient(
    createRecordedSession({
      galleryPage: () => ({ data: null, errors: [{ message: "media unavailable" }] }),
      tray: trayBody(),
    }),
  );

  await expect(world.run({ client })).rejects.toThrow(
    /No story media could be fetched.*media unavailable/u,
  );

  const [run] = world.runs.list();
  expect(run.status).toBe("failed");
  expect(run.failedCount).toBe(3);
  expect(run.storiesCount).toBe(3);
  assert.ok(run.reportKey !== null);
  const saved = world.reports.findByKey(run.reportKey);
  expect(saved?.failures.map(({ message }) => message)).toStrictEqual([
    "Instagram story media query failed: media unavailable",
    "Instagram story media query failed: media unavailable",
    "Instagram story media query failed: media unavailable",
  ]);
  // Nothing was enriched.
  expect(world.calls).toStrictEqual([]);
  expect(world.stories.findByMediaPk(imageStoryPk)).toBeNull();
});

test("stores a succeeded run and its observation for an empty tray", async (context) => {
  const world = await createWorld(context, {
    client: await createRecordedInstagramClient(
      {
        ...(await recordedPayloads()),
        tray: { broadcasts: [], status: "ok", story_ranking_token: "synthetic", tray: [] },
      },
      { publishedBefore },
    ),
  });

  const result = await world.run();

  const [run] = world.runs.list();
  expect(run).toMatchObject({
    fetchedCount: 0,
    reportKey: result.reportKey,
    status: "succeeded",
    storiesCount: 0,
  });
  expect(world.reports.findByKey(result.reportKey)?.output.users).toStrictEqual([]);
  expect(world.calls).toStrictEqual([]);
});

test("stores a partial run when some stories cannot be fetched", async (context) => {
  const world = await createWorld(context, {
    client: await createRecordedInstagramClient(
      { ...(await recordedPayloads()), tray: trayBody({ withMissingReel: true }) },
      { publishedBefore },
    ),
  });

  const result = await world.run();

  const [run] = world.runs.list();
  expect(run).toMatchObject({
    failedCount: 1,
    fetchedCount: 3,
    reportKey: result.reportKey,
    status: "partial",
    storiesCount: 4,
  });
  expect(world.reports.findByKey(result.reportKey)?.failures).toHaveLength(1);
  // The stories that were fetched still go through the whole pipeline.
  expect(world.stories.findByMediaPk(musicStoryPk)).not.toBeNull();
  expect(world.vision.findByMediaPk(musicStoryPk)).not.toBeNull();
});

test("keeps the observation and marks the run failed when enrichment fails", async (context) => {
  const world = await createWorld(context);
  // A database that refuses to store users, as a full disk would.
  world.database.$client.exec(
    "CREATE TRIGGER refuse_users BEFORE INSERT ON instagram_users BEGIN SELECT RAISE(ABORT, 'disk full'); END",
  );

  await expect(world.run()).rejects.toThrow(/instagram_users/u);

  const [run] = world.runs.list();
  expect(run.status).toBe("failed");
  expect(run.error).toMatch(/instagram_users/u);
  expect(run.fetchedCount).toBe(3);
  assert.ok(run.reportKey !== null);
  expect(world.reports.findByKey(run.reportKey)).toBeTruthy();
});

test("separate attempts at the same instant preserve separate runs and observations", async (context) => {
  const world = await createWorld(context);

  const first = await world.run();
  const visionRequests = world.ollama.requests.filter(({ kind }) => kind === "vision").length;
  const second = await world.run();

  expect(first.reportKey).not.toBe(second.reportKey);
  expect(world.runs.list()).toHaveLength(2);
  expect(world.reports.listKeys()).toHaveLength(2);
  // The second run reuses what the first stored instead of analysing the same previews again.
  expect(world.ollama.requests.filter(({ kind }) => kind === "vision")).toHaveLength(
    visionRequests,
  );
});
