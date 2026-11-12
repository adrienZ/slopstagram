import { expect, test } from "vitest";
import { loadAccountTimeline } from "../app/loaders/account-timeline.ts";
import { saveCurrentVision } from "./mock-helpers.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

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
  const current = await saveCurrentVision(runtime, "current", {
    text: "current text",
    visual: "current description",
  });
  await runtime.vision.save("outdated", {
    model: "retired-model",
    prompt_hash: current.prompt_hash,
    result: { text: "outdated text", visual: "outdated description" },
  });

  const { stories } = loadAccountTimeline(runtime, "vision-user");

  expect(
    stories.map(({ mediaPk, visionDescription, visionOcr, visionOutdated }) => ({
      mediaPk,
      visionDescription,
      visionOcr,
      visionOutdated,
    })),
  ).toStrictEqual([
    {
      mediaPk: "current",
      visionDescription: "current description",
      visionOcr: "current text",
      visionOutdated: undefined,
    },
    {
      mediaPk: "outdated",
      visionDescription: "outdated description",
      visionOcr: "outdated text",
      visionOutdated: {
        currentModel: current.model,
        currentPromptHash: current.prompt_hash,
        model: "retired-model",
        promptHash: current.prompt_hash,
      },
    },
  ]);
});
