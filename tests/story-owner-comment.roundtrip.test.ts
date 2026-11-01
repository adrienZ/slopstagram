import { expect, test } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import type { JsonValue } from "../sdk/lib/json-value.ts";
import type { StoryItem } from "../sdk/instagram-types.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import { createMemoryStorage } from "./memory-storage.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  noSleep,
  reel,
  reelsResponse,
  response,
} from "./mock-helpers.ts";

const owner = { username: "story_owner", pk: "100000001" };

function setup(context: { onTestFinished: (callback: () => void) => void }) {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  return new StoryRepository(database);
}

function story(pk: string, storyComments?: JsonValue): StoryItem {
  const item: StoryItem = {
    pk,
    media_type: 1,
    taken_at: 1_790_000_000,
    image_versions2: { candidates: [{ url: `https://example.com/${pk}.jpg` }] },
  };
  if (storyComments !== undefined) {
    item.story_comments = storyComments;
  }
  return item;
}

function comment(pk: string, text: string, isOwner: boolean, createdAt = 1_790_000_100) {
  return { pk, text, created_at: createdAt, is_created_by_media_owner: isOwner };
}

// The double of the app's own Instagram client: canned comments endpoint answers by media pk.
function createCommentClient(
  stories: Array<StoryItem>,
  answers: Partial<Record<string, () => ReturnType<typeof response<JsonValue>>>> = {},
) {
  const client = createClient(
    [{ id: "reel", media_ids: stories.map(({ pk }) => pk), user: owner }],
    [reelsResponse({ reel: { ...reel("reel", stories), user: owner } })],
  );
  const lookups: Array<string> = [];
  return Object.assign(client, {
    lookups,
    async getStoryComments(mediaPk: string) {
      lookups.push(mediaPk);
      const answer = answers[mediaPk];
      if (answer === undefined) {
        throw new Error(`Unexpected comments request ${mediaPk}`);
      }
      return answer();
    },
  });
}

async function ingest(
  repository: StoryRepository,
  client: ReturnType<typeof createCommentClient>,
  logger = createCapturingLogger(),
) {
  await fetchStoriesManifest(client, {
    storyRepository: repository,
    storyStorage: createMemoryStorage(),
    logger,
    now: fixedNow,
    sleep: noSleep,
  });
}

test("an owner comment already inside the story payload is stored without another request", async (context) => {
  const repository = setup(context);
  const client = createCommentClient([
    story("m1", [comment("c1", "👍", true), comment("c2", "bravo", false)]),
  ]);
  await ingest(repository, client);
  expect(repository.findOwnerComments("m1")).toStrictEqual([
    { commentPk: "c1", createdAt: 1_790_000_100, text: "👍" },
  ]);
  expect(client.lookups).toStrictEqual([]);
});

test("a story whose payload carries no comments gets its owner comment from the comments endpoint", async (context) => {
  const repository = setup(context);
  const client = createCommentClient([story("m1", null)], {
    m1: () =>
      response({
        comment_count: 2,
        comments: [
          { ...comment("18000000000000001", "Meet me outside", true), user_id: 100_000_001 },
          comment("18000000000000002", "haha", false),
        ],
      }),
  });
  await ingest(repository, client);
  expect(repository.findOwnerComments("m1")).toStrictEqual([
    { commentPk: "18000000000000001", createdAt: 1_790_000_100, text: "Meet me outside" },
  ]);
  expect(client.lookups).toStrictEqual(["m1"]);
});

test("a story nobody commented on keeps no owner comments", async (context) => {
  const repository = setup(context);
  const client = createCommentClient([story("m1")], { m1: () => response({ comments: [] }) });
  await ingest(repository, client);
  expect(repository.findOwnerComments("m1")).toStrictEqual([]);
});

test("ingesting the same story again does not duplicate its owner comment", async (context) => {
  const repository = setup(context);
  const answers = {
    m1: () => response({ comments: [comment("c1", "Meet me outside", true)] }),
  };
  await ingest(repository, createCommentClient([story("m1")], answers));
  await ingest(repository, createCommentClient([story("m1")], answers));
  expect(repository.findOwnerComments("m1")).toHaveLength(1);
});

test("a comments request that fails does not stop story ingestion", async (context) => {
  const repository = setup(context);
  const logger = createCapturingLogger();
  const client = createCommentClient([story("m1"), story("m2")], {
    m1: () => {
      throw new Error("Instagram returned text/html");
    },
    m2: () => response({ comments: [comment("c2", "ok", true)] }),
  });
  await ingest(repository, client, logger);
  expect(repository.findByMediaPk("m1")).not.toBeNull();
  expect(repository.findOwnerComments("m2")).toHaveLength(1);
  expect(logger.messages.join("\n")).toContain("owner comment lookup failed");
});

test("comment lookups stop once Instagram rate limits them", async (context) => {
  const repository = setup(context);
  const logger = createCapturingLogger();
  const client = createCommentClient([story("m1"), story("m2")], {
    m1: () => response({}, 429),
  });
  await ingest(repository, client, logger);
  expect(client.lookups).toStrictEqual(["m1"]);
  expect(repository.findByMediaPk("m2")).not.toBeNull();
  expect(logger.messages.join("\n")).toContain(
    "owner comment lookup stopped after Instagram HTTP 429",
  );
});
