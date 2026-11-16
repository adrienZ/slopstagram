import type { StoriesManifestReport } from "./report-types.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { fetchStories, type FetchStoriesOptions, type FetchStoriesRuntime } from "./stories.ts";

export type FetchStoriesInSessionRuntime = FetchStoriesRuntime &
  Pick<Runtime, "withInstagramClient">;

export async function fetchStoriesInSession(
  runtime: FetchStoriesInSessionRuntime,
  options: FetchStoriesOptions = {},
): Promise<StoriesManifestReport> {
  return await runtime.withInstagramClient(
    async (client) => await fetchStories({ ...runtime, client }, options),
  );
}
