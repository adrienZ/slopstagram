import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { getProductionRuntime } from "@@/core/runtime/production-runtime.ts";
import { storyDateSchema } from "@@/core/story-feed/story-days.ts";

export const getReport = createServerFn({ method: "GET" })
  .validator(z.object({ date: storyDateSchema.optional(), story: z.string().optional() }))
  .handler(async ({ data }) => {
    const { loadStoryFeed } = await import("./loaders/story-feed.ts");
    try {
      return loadStoryFeed(getProductionRuntime(), new Date(), data.date, data.story);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 404) {
        notFound({ throw: true });
      }
      throw error;
    }
  });

export const getUserTimeline = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data }) => {
    const { loadAccountTimeline } = await import("./loaders/account-timeline.ts");
    try {
      return loadAccountTimeline(getProductionRuntime(), data);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 404) {
        notFound({ throw: true });
      }
      throw error;
    }
  });

export const getChatPage = createServerFn({ method: "GET" }).handler(async () => {
  const { loadChatPage } = await import("./loaders/chat.ts");
  return loadChatPage(getProductionRuntime());
});
