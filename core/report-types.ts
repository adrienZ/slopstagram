import type { z } from "zod";
import type {
  StoriesManifestReportSchema,
  StoryFetchFailureSchema,
  StoryManifestItemSchema,
  StoryManifestReelSchema,
  StoryOutputUserSchema,
} from "./lib/story-schemas.ts";

export type StoryFetchFailure = z.infer<typeof StoryFetchFailureSchema>;
export type StoryFetchFailureReason = StoryFetchFailure["reason"];
export type StoryManifestItem = z.infer<typeof StoryManifestItemSchema>;
export type StoryManifestReel = z.infer<typeof StoryManifestReelSchema>;
export type StoryOutputUser = z.infer<typeof StoryOutputUserSchema>;
export type StoriesManifestReport = z.infer<typeof StoriesManifestReportSchema>;
