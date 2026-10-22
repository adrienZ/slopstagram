import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import type { StoryTrayEntry } from "../sdk/lib/types.ts";
import {
  createClient,
  createCapturingLogger,
  createMemoryStoryRepository,
  response,
} from "./mock-helpers.ts";

function trayEntry(username: string, pk = username): StoryTrayEntry {
  return { id: pk, media_ids: [], user: { pk, username } };
}

test("fetches each biography once and carries it into report output", async () => {
  const client = createClient([trayEntry("traveler"), trayEntry("traveler")], []);
  const calls: Array<string> = [];
  client.getUserProfile = async (username) => {
    calls.push(username);
    return response({ biography: "Travel photographer", id: username, username });
  };
  const repository = createMemoryStoryRepository();
  const report = await fetchStoriesManifest(client, {
    logger: createCapturingLogger(),
    storyRepository: repository,
    storyStorage: repository.storyStorage,
  });
  assert.deepEqual(calls, ["traveler"]);
  assert.deepEqual(
    report.manifest.users.map((user) => user.biography),
    ["Travel photographer", "Travel photographer"],
  );
  assert.equal(report.output.users[0].biography, "Travel photographer");
});

test("skips embedded biographies and rejects a profile whose stable identity differs", async () => {
  const embedded = trayEntry("embedded");
  embedded.user.biography = "";
  const client = createClient([embedded, trayEntry("traveler", "expected-pk")], []);
  const calls: Array<string> = [];
  client.getUserProfile = async (username) => {
    calls.push(username);
    return response({ biography: "Wrong user", id: "different-pk", username });
  };
  const logger = createCapturingLogger();
  const repository = createMemoryStoryRepository();
  const report = await fetchStoriesManifest(client, {
    logger,
    storyRepository: repository,
    storyStorage: repository.storyStorage,
  });
  assert.deepEqual(calls, ["traveler"]);
  assert.equal(report.output.users[0].biography, "");
  assert.equal(report.output.users[1].biography, undefined);
  assert.ok(logger.messages.some((message) => message.includes("identity mismatch")));
});

test("keeps the report usable and stops profile enrichment after a rate limit", async () => {
  const client = createClient([trayEntry("first"), trayEntry("second")], []);
  const calls: Array<string> = [];
  client.getUserProfile = async (username) => {
    calls.push(username);
    return response({ biography: null, id: username, username }, 429);
  };
  const logger = createCapturingLogger();
  const repository = createMemoryStoryRepository();
  const report = await fetchStoriesManifest(client, {
    logger,
    maxAttempts: 1,
    storyRepository: repository,
    storyStorage: repository.storyStorage,
  });
  assert.deepEqual(calls, ["first"]);
  assert.equal(report.output.users.length, 2);
  assert.ok(logger.messages.some((message) => message.includes("could not fetch biography")));
});
