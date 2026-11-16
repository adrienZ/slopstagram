import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";
import { storyDateSchema } from "@@/core/domains/story-feed/story-days.ts";
import { createPageData, type PageData } from "./page-data.ts";

const getAccountTimeline = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(
    async ({ data }) => await createPageData(getProductionRuntime()).accountTimeline({ data }),
  );

const getChatPage = createServerFn({ method: "GET" }).handler(
  async () => await createPageData(getProductionRuntime()).chatPage(),
);

const getMentionGraph = createServerFn({ method: "GET" })
  .validator(z.object({ accounts: z.array(z.string()) }))
  .handler(async ({ data }) => await createPageData(getProductionRuntime()).mentionGraph({ data }));

const getPlaceMap = createServerFn({ method: "GET" }).handler(
  async () => await createPageData(getProductionRuntime()).placeMap(),
);

const getStoryFeed = createServerFn({ method: "GET" })
  .validator(z.object({ date: storyDateSchema.optional(), story: z.string().optional() }))
  .handler(async ({ data }) => await createPageData(getProductionRuntime()).storyFeed({ data }));

export const serverPageData: PageData = {
  accountTimeline: getAccountTimeline,
  chatPage: getChatPage,
  mentionGraph: getMentionGraph,
  placeMap: getPlaceMap,
  storyFeed: getStoryFeed,
};
