import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { visionRepository } from "../sdk/repositories/vision-repository.ts";
import { VISION_MODEL, VISION_PROMPT } from "../sdk/lib/vision-analysis-service.ts";
import { loadUserTimeline } from "../server/user-timeline-handler.tsx";
import { seedRecordedStories } from "./seed.ts";

beforeAll(async () => {
  migrateDatabase();
  await seedRecordedStories();
});

test("the account timeline shows only vision results from the current model and prompt", async () => {
  const promptHash = createHash("sha256").update(VISION_PROMPT).digest("hex");
  await visionRepository.save("700000000000292", {
    model: VISION_MODEL,
    prompt_hash: promptHash,
    result: { text: "current text", visual: "current description" },
  });
  await visionRepository.save("700000000000314", {
    model: "retired-model",
    prompt_hash: promptHash,
    result: { text: "stale text", visual: "stale description" },
  });

  const { stories } = loadUserTimeline("user_019");

  expect(
    stories.map(({ mediaPk, visionOcr, visionDescription }) => ({
      mediaPk,
      visionOcr,
      visionDescription,
    })),
  ).toEqual([
    { mediaPk: "700000000000314", visionOcr: "—", visionDescription: "—" },
    {
      mediaPk: "700000000000292",
      visionOcr: "current text",
      visionDescription: "current description",
    },
  ]);
});
