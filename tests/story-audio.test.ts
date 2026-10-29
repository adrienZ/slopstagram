import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { startMediaServer, wavAudio } from "./media-server.ts";
import { test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { dashAudioSource } from "../sdk/lib/dash-audio.ts";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { processStoryAudio, cacheReportAudio } from "../sdk/report-audio-service.ts";
import { createMediaResponse } from "../server/routes/media/[...path].ts";
import { groupTimelineStickers } from "../server/timeline-stickers.ts";
import { musicStickerItems, storyMusicPreviews } from "../server/music-preview.ts";
import type { StoriesManifestReport } from "../sdk/report-types.ts";
import type { StoryItem } from "../sdk/instagram-types.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  reel,
  response as mockResponse,
} from "./mock-helpers.ts";

function manifest(name: string) {
  return `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
      <AdaptationSet contentType="video"><Representation mimeType="video/mp4" codecs="avc1.4d401e">
        <BaseURL>https://example.com/video.mp4</BaseURL>
      </Representation></AdaptationSet>
      <AdaptationSet contentType="audio"><Representation mimeType="audio/mp4" codecs="mp4a.40.5" bandwidth="58686">
        <BaseURL>https://example.com/${name}.mp4?a=1&amp;b=2</BaseURL>
        <SegmentBase indexRange="824-975"><Initialization range="0-823"/></SegmentBase>
      </Representation></AdaptationSet>
    </Period>
  </MPD>`;
}

test("web story ingestion preserves DASH audio separately from shared music, including missing asset IDs", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  const info = {
    title: "Song",
    display_artist: "Artist",
    should_mute_audio: false,
    should_mute_audio_reason: "",
  };
  for (const pk of ["first", "second"]) {
    // oxlint-disable-next-line no-await-in-loop -- Exercise independent observations of the same song.
    await repository.save({
      pk,
      video_dash_manifest: manifest(pk),
      story_music_stickers: [{ id: pk, music_asset_info: info }],
    });
  }
  const cold = new StoryRepository(database);
  const first = cold.findByMediaPk("first");
  const second = cold.findByMediaPk("second");
  assert.ok(
    first?.annotations?.storyAudio,
    "the received MPD audio must survive a cold database read",
  );
  assert.ok(second?.annotations?.storyAudio);
  assert.equal(first.annotations.storyAudio.sourceUrl, "https://example.com/first.mp4?a=1&b=2");
  assert.notEqual(first.annotations.storyAudio.sourceUrl, second.annotations.storyAudio.sourceUrl);
  assert.equal(first.annotations.storyAudio.mimeType, "audio/mp4");
  assert.equal(first.annotations.storyAudio.codecs, "mp4a.40.5");
  assert.equal(first.annotations.storyAudio.state, "pending");
  assert.equal(first.annotations.musicObservations?.[0].metadata.instagramAudioAssetId, null);
  assert.equal(first.annotations.musicObservations[0].metadata.audioSourceUrl, null);
  await repository.save({ pk: "first", video_dash_manifest: "<broken>" });
  assert.deepEqual(
    cold.findByMediaPk("first")?.annotations?.storyAudio,
    first.annotations.storyAudio,
  );
  await repository.save(first);
  assert.deepEqual(
    cold.findByMediaPk("first")?.annotations?.storyAudio,
    first.annotations.storyAudio,
  );
  for (const pk of ["first", "second"]) {
    // oxlint-disable-next-line no-await-in-loop -- Promote two observations to the same shared music asset.
    await repository.save({
      pk,
      story_music_stickers: [{ id: pk, music_asset_info: { ...info, audio_asset_id: "shared" } }],
    });
  }
  const promoted = cold.findByMediaPk("first")?.annotations;
  const shared = cold.findByMediaPk("second")?.annotations;
  assert.equal(
    promoted?.musicObservations?.[0].metadata.id,
    shared?.musicObservations?.[0].metadata.id,
  );
  assert.deepEqual(promoted?.storyAudio, first.annotations.storyAudio);
  assert.deepEqual(shared?.storyAudio, second.annotations.storyAudio);
});

test("DASH selection decodes XML, resolves received base URLs and selects supported audio deterministically", () => {
  const xml = manifest("first");
  assert.equal(dashAudioSource(xml)?.sourceUrl, "https://example.com/first.mp4?a=1&b=2");
  const inherited = xml
    .replace("<Period>", "<BaseURL>https://example.com/media/</BaseURL><Period>")
    .replace("https://example.com/first.mp4", "first.mp4");
  assert.equal(
    dashAudioSource(inherited)?.sourceUrl,
    "https://example.com/media/first.mp4?a=1&b=2",
  );
  const namespaced = xml
    .replaceAll(
      /<(?<slash>\/?)(?<tag>MPD|Period|AdaptationSet|Representation|BaseURL|SegmentBase|Initialization)\b/gu,
      "<$<slash>d:$<tag>",
    )
    .replace("xmlns=", "xmlns:d=");
  assert.equal(dashAudioSource(namespaced)?.codecs, "mp4a.40.5");
  const lower =
    '<Representation mimeType="audio/mp4" codecs="mp4a.40.2" bandwidth="1"><BaseURL>https://example.com/lower.mp4</BaseURL></Representation>';
  assert.equal(
    dashAudioSource(
      xml.replace(
        '<AdaptationSet contentType="audio">',
        `<AdaptationSet contentType="audio">${lower}`,
      ),
    )?.codecs,
    "mp4a.40.5",
  );
});

test("malformed, protected, segmented, relative-only and video-only manifests do not become audio sources", () => {
  const xml = manifest("first");
  for (const value of [
    "",
    "<MPD>",
    xml.replace('type="static"', 'type="dynamic"'),
    xml.replace('contentType="audio"', 'contentType="video"'),
    xml.replace('mimeType="audio/mp4"', 'mimeType="video/mp4"'),
    xml.replace("mp4a.40.5", "unsupported"),
    xml.replace("https://example.com/first.mp4", "first.mp4"),
    xml.replace("https://example.com/first.mp4", "http://example.com/first.mp4"),
    xml.replace("<Period>", "<Period><ContentProtection/>"),
    xml.replace("<Period>", "<Period><SegmentTemplate/>"),
    xml.replace("<Period>", "<Period><SegmentList/>"),
    xml.replace("</MPD>", "<Period/></MPD>"),
    `<!DOCTYPE MPD [<!ENTITY audio "https://example.com/secret">]>${xml}`,
  ]) {
    assert.equal(dashAudioSource(value), null);
  }
});

test("report audio processing caches MPD audio served as video/mp4, supports ranges, and reuses it offline", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const directory = await mkdtemp(path.join(tmpdir(), "story-audio-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(directory, { force: true, recursive: true });
  });
  const repository = new StoryRepository(database);
  await repository.save({
    pk: "story",
    video_dash_manifest: manifest("story"),
    story_music_stickers: [{ music_asset_info: { title: "Song", display_artist: "Artist" } }],
  });
  const item = {
    media_pk: "story",
    status: "ok" as const,
    ig_caption: "",
    locations: [],
    stickers: [],
    preview_image_url: null,
  };
  const report: StoriesManifestReport = {
    failures: [],
    manifest: { users: [] },
    metadata: {
      broadcasts_count: 0,
      counts: { cache_hits: 0, cache_misses: 1, failed: 0, fetched: 1, reels: 1, stories: 1 },
      created_at: "2026-10-26T12:00:00Z",
      report_name: "audio",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          username: "one",
          full_name: null,
          profile_pic_url: null,
          reel_ids: [],
          stories: [item, item],
        },
      ],
    },
  };
  const audio = await readFile(new globalThis.URL("fixtures/audio-clip.m4a", import.meta.url));
  const media = await startMediaServer(context, (_request, response) => {
    response.writeHead(200, { "content-type": "video/mp4" });
    response.end(audio);
  });
  await cacheReportAudio(report, {
    database,
    directory,
    fetchMedia: media.fetchMedia,
  });
  assert.deepEqual(media.requests, ["/story.mp4?a=1&b=2"]);
  const saved = new StoryRepository(database).findByMediaPk("story")?.annotations?.storyAudio;
  assert.ok(saved);
  assert.notEqual(saved.cachePath, null);
  assert.ok(saved.cachePath !== null);
  assert.equal(saved.state, "available");
  const previews = storyMusicPreviews(
    new StoryRepository(database).findByMediaPk("story")?.annotations,
  );
  assert.equal(previews.length, 1);
  assert.equal(previews[0].description, "Song — Artist");
  assert.equal(previews[0].sourceKind, "story_audio");
  assert.equal(path.extname(saved.cachePath), ".m4a");
  assert.deepEqual(await readFile(path.join(directory, saved.cachePath)), audio);
  assert.equal(saved.durationMs, 1023);
  const ranged = await createMediaResponse(saved.cachePath, directory, { range: "bytes=0-4" });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-type"), "audio/mp4");
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), audio.subarray(0, 5));
  await repository.save({
    pk: "story",
    video_dash_manifest: manifest("fresh"),
    story_music_stickers: [{ music_asset_info: { title: "Song" } }],
  });
  const reused = await processStoryAudio("story", {
    database,
    directory,
    fetchMedia: media.fetchMedia,
  });
  assert.equal(reused?.cachePath, saved.cachePath);
  assert.deepEqual(media.requests, ["/story.mp4?a=1&b=2"]);
  await repository.save({
    pk: "story",
    video_dash_manifest: manifest("fresh"),
    story_music_stickers: [{ music_asset_info: { title: "Song", should_mute_audio: true } }],
  });
  assert.equal(
    new StoryRepository(database).findByMediaPk("story")?.annotations?.storyAudio,
    undefined,
  );
});

test("expired and interrupted DASH downloads fail silently without publishing incomplete files", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const directory = await mkdtemp(path.join(tmpdir(), "story-audio-failed-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(directory, { force: true, recursive: true });
  });
  const repository = new StoryRepository(database);
  await repository.save({
    pk: "story",
    video_dash_manifest: manifest("story"),
    story_music_stickers: [{ music_asset_info: { title: "Song" } }],
  });
  let interrupted = false;
  const media = await startMediaServer(context, (_request, response) => {
    if (interrupted) {
      response.writeHead(200, { "content-type": "video/mp4", "content-length": 1000 });
      response.flushHeaders();
      response.write(new Uint8Array([1]));
      response.destroy();
    } else {
      response.writeHead(403);
      response.end("expired");
    }
  });
  const failed = await processStoryAudio("story", {
    database,
    directory,
    fetchMedia: media.fetchMedia,
  });
  assert.equal(failed?.state, "failed");
  assert.equal(failed.cachePath, null);
  const story = repository.findByMediaPk("story");
  assert.ok(story);
  const groups = groupTimelineStickers(
    [
      {
        story,
        taken_at: 1_767_225_600,
        stickers: [],
        locations: [],
        username: "one",
        owner_pk: "one",
        full_name: null,
      },
    ],
    ["music"],
  );
  assert.equal(groups[0].stories[0].musicItems?.[0].preview, null);
  assert.equal(groups[0].stories[0].labels[0].label, "Song");
  interrupted = true;
  const interruptedResult = await processStoryAudio("story", {
    database,
    directory,
    fetchMedia: media.fetchMedia,
  });
  assert.equal(interruptedResult?.state, "failed");
  assert.deepEqual(await readdir(directory), []);
});

test("ordinary video soundtracks are not classified as music without received music annotations", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  await repository.save({ pk: "ordinary", video_dash_manifest: manifest("ordinary") });
  assert.equal(repository.findByMediaPk("ordinary")?.annotations?.storyAudio, undefined);
});

test("reels shared into a story do not create or retain a downloadable soundtrack", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  const repository = new StoryRepository(database);
  const story = {
    pk: "reel-share",
    video_dash_manifest: manifest("reel"),
    story_music_stickers: [{ music_asset_info: { title: "Song", display_artist: "Artist" } }],
  };
  await repository.save(story);
  assert.ok(repository.findByMediaPk(story.pk)?.annotations?.storyAudio);
  await repository.save({ ...story, story_feed_media: [{ id: "reel", product_type: "clips" }] });
  const cold = new StoryRepository(database).findByMediaPk(story.pk);
  assert.equal(cold?.annotations?.storyAudio, undefined);
  assert.ok(cold?.annotations);
  assert.equal(cold.annotations.stickers[0].kind, "music");
  await repository.save({ ...story, pk: "direct-reel", product_type: "clips" });
  assert.equal(repository.findByMediaPk("direct-reel")?.annotations?.storyAudio, undefined);
});

test("fresh story ingestion caches the story excerpt and prefers it over the longer music asset", async (context) => {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  const directory = await mkdtemp(path.join(tmpdir(), "future-story-audio-"));
  context.onTestFinished(async () => {
    database.$client.close();
    await rm(directory, { recursive: true, force: true });
  });
  const story: StoryItem = {
    pk: "fresh",
    video_dash_manifest: manifest("fresh"),
    story_music_stickers: [
      {
        id: "sticker",
        music_asset_info: {
          audio_asset_id: "asset",
          title: "Song",
          display_artist: "Artist",
          progressive_download_url: "https://example.com/song.wav",
          duration_in_ms: 180_000,
        },
      },
    ],
  };
  const owner = { id: "user", pk: "user", username: "one" };
  const client = createClient(
    [{ id: "reel", media_ids: [story.pk], user: owner }],
    [mockResponse({ reels: { reel: { ...reel("reel", [story]), user: owner } } })],
  );
  const repository = new StoryRepository(database);
  const report = await fetchStoriesManifest(client, {
    storyRepository: repository,
    storyStorage: createMemoryStorage<StoryItem>(),
    logger: createCapturingLogger(),
    now: fixedNow,
  });
  const storyBytes = await readFile(new globalThis.URL("fixtures/audio-clip.m4a", import.meta.url));
  const musicBytes = wavAudio(70);
  const media = await startMediaServer(context, (request, response) => {
    if (request.url?.startsWith("/fresh.mp4") === true) {
      response.writeHead(200, { "content-type": "video/mp4" });
      response.end(storyBytes);
    } else {
      response.writeHead(200, { "content-type": "audio/wav" });
      response.end(musicBytes);
    }
  });
  await cacheReportAudio(report, { database, directory, fetchMedia: media.fetchMedia });
  const annotations = new StoryRepository(database).findByMediaPk(story.pk)?.annotations;
  assert.ok(annotations?.storyAudio);
  assert.ok(annotations.storyAudio.cachePath !== null);
  const music = annotations.musicObservations?.[0].metadata;
  assert.ok(music);
  assert.ok(music.audioCachePath !== null);
  assert.equal(music.audioDurationMs, 70_000);
  assert.equal(annotations.storyAudio.durationMs, 1023);
  const previews = musicStickerItems(annotations);
  assert.equal(previews.length, 1);
  assert.ok(previews[0].preview);
  assert.equal(previews[0].preview.sourceKind, "story_audio");
  assert.equal(previews[0].preview.audioUrl, `/media/${annotations.storyAudio.cachePath}`);
  assert.equal(previews[0].preview.durationMs, 1023);
  assert.deepEqual(
    await readFile(path.join(directory, annotations.storyAudio.cachePath)),
    storyBytes,
  );
  assert.deepEqual(media.requests, ["/song.wav", "/fresh.mp4?a=1&b=2"]);
});
