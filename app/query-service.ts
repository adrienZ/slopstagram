import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";
import { storyDateSchema } from "@@/core/domains/story-feed/story-days.ts";

export const getReport = createServerFn({ method: "GET" })
  .validator(z.object({ date: storyDateSchema.optional(), story: z.string().optional() }))
  .handler(async ({ data }) => {
    const { loadStoryFeed } = await import("./loaders/story-feed.ts");

    return loadStoryFeed(getProductionRuntime(), new Date(), data.date, data.story);
  });

export const getUserTimeline = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data }) => {
    const { loadAccountTimeline } = await import("./loaders/account-timeline.ts");

    return loadAccountTimeline(getProductionRuntime(), data);
  });

export const getChatPage = createServerFn({ method: "GET" }).handler(async () => {
  const { loadChatPage } = await import("./loaders/chat.ts");

  return loadChatPage(getProductionRuntime());
});

export const getPlaceMap = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPlaceMap } = await import("./loaders/place-map.ts");

  return loadPlaceMap(getProductionRuntime());
});

export const getMentionGraph = createServerFn({ method: "GET" })
  .validator(z.object({ accounts: z.array(z.string()) }))
  .handler(async ({ data }) => {
    const { loadMentionGraph } = await import("./loaders/mention-graph.ts");

    return loadMentionGraph(getProductionRuntime(), data.accounts);
  });
