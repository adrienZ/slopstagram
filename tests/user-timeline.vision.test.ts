import { createHash } from "node:crypto";
import { assert, beforeAll, expect, test } from "vitest";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { instagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { storyRepository } from "../sdk/repositories/story-repository.ts";
import { visionRepository } from "../sdk/repositories/vision-repository.ts";
import { VISION_MODEL, VISION_PROMPT } from "../sdk/lib/vision-analysis-service.ts";
import { createUserTimeline } from "../server/user-timeline.ts";

const promptHash = createHash("sha256").update(VISION_PROMPT).digest("hex");

beforeAll(async () => {
  migrateDatabase();
  await instagramUserRepository.save({
    full_name: "Vision User",
    id: "vision-id",
    pk: "vision-pk",
    username: "vision-user",
  });
  const owner = { pk: "vision-pk", username: "vision-user" };
  await storyRepository.save({ media_type: 1, pk: "current", taken_at: 1_767_225_600 }, owner);
  await storyRepository.save({ media_type: 1, pk: "outdated", taken_at: 1_767_225_500 }, owner);
  await visionRepository.save("current", {
    model: VISION_MODEL,
    prompt_hash: promptHash,
    result: { text: "current text", visual: "current description" },
  });
  await visionRepository.save("outdated", {
    model: "retired-model",
    prompt_hash: promptHash,
    result: { text: "outdated text", visual: "outdated description" },
  });
});

test("the account timeline keeps outdated vision results and reports how they are outdated", () => {
  const timeline = createUserTimeline("vision-user");

  assert.ok(timeline);
  expect(timeline.visionByPreviewUrl).toStrictEqual(
    new Map([
      [
        "images/story-previews/current.jpg",
        { text: "current text", visual: "current description" },
      ],
      [
        "images/story-previews/outdated.jpg",
        { text: "outdated text", visual: "outdated description" },
      ],
    ]),
  );
  expect(timeline.outdatedVisionByPreviewUrl).toStrictEqual(
    new Map([
      [
        "images/story-previews/outdated.jpg",
        {
          currentModel: VISION_MODEL,
          currentPromptHash: promptHash,
          model: "retired-model",
          promptHash,
        },
      ],
    ]),
  );
});
