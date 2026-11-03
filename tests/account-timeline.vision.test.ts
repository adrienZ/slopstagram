import { createHash } from "node:crypto";
import { assert, expect, test } from "vitest";
import { VISION_MODEL, VISION_PROMPT } from "@@/core/vision/vision-analysis.ts";
import { createUserTimeline } from "../app/loaders/account-timeline.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

const promptHash = createHash("sha256").update(VISION_PROMPT).digest("hex");

test("the account timeline keeps outdated vision results and reports how they are outdated", async (context) => {
  const runtime = await createTestRuntime(context);
  await runtime.users.save({
    full_name: "Vision User",
    id: "vision-id",
    pk: "vision-pk",
    username: "vision-user",
  });
  const owner = { pk: "vision-pk", username: "vision-user" };
  await runtime.stories.save({ media_type: 1, pk: "current", taken_at: 1_767_225_600 }, owner);
  await runtime.stories.save({ media_type: 1, pk: "outdated", taken_at: 1_767_225_500 }, owner);
  await runtime.vision.save("current", {
    model: VISION_MODEL,
    prompt_hash: promptHash,
    result: { text: "current text", visual: "current description" },
  });
  await runtime.vision.save("outdated", {
    model: "retired-model",
    prompt_hash: promptHash,
    result: { text: "outdated text", visual: "outdated description" },
  });

  const timeline = createUserTimeline(runtime, "vision-user");

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
