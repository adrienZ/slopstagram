import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";
import { storyDateSchema } from "@@/core/domains/story-feed/story-days.ts";
import { loadAccountTimeline } from "./loaders/account-timeline.ts";
import { loadChatPage } from "./loaders/chat.ts";
import { loadMentionGraph } from "./loaders/mention-graph.ts";
import { loadPlaceMap } from "./loaders/place-map.ts";
import { loadStoryFeed } from "./loaders/story-feed.ts";

export const getReport = createServerFn({ method: "GET" })
  .validator(z.object({ date: storyDateSchema.optional(), story: z.string().optional() }))
  .handler(({ data }) => loadStoryFeed(getProductionRuntime(), new Date(), data.date, data.story));

export const getUserTimeline = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(({ data }) => loadAccountTimeline(getProductionRuntime(), data));

export const getChatPage = createServerFn({ method: "GET" }).handler(() =>
  loadChatPage(getProductionRuntime()),
);

export const getPlaceMap = createServerFn({ method: "GET" }).handler(() =>
  loadPlaceMap(getProductionRuntime()),
);

export const getMentionGraph = createServerFn({ method: "GET" })
  .validator(z.object({ accounts: z.array(z.string()) }))
  .handler(({ data }) => loadMentionGraph(getProductionRuntime(), data.accounts));
