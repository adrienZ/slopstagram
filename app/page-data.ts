import "@tanstack/react-start/server-only";
import { notFound } from "@tanstack/react-router";
import { HTTPError } from "nitro/h3";
import { loadAccountTimeline, type AccountTimelinePageData } from "./loaders/account-timeline.ts";
import { loadChatPage, type ChatPageData } from "./loaders/chat.ts";
import { loadMentionGraph, type MentionGraphPageData } from "./loaders/mention-graph.ts";
import { loadPlaceMap, type PlaceMapPageData } from "./loaders/place-map.ts";
import { loadStoryFeed, type StoryFeedPageData } from "./loaders/story-feed.ts";

/** What each page's route loader reads, shaped like the server functions that serve it. */
export interface PageData {
  accountTimeline: (request: { data: string }) => Promise<AccountTimelinePageData>;
  chatPage: () => Promise<ChatPageData>;
  mentionGraph: (request: { data: { accounts: Array<string> } }) => Promise<MentionGraphPageData>;
  placeMap: () => Promise<PlaceMapPageData>;
  storyFeed: (request: { data: { date?: string; story?: string } }) => Promise<StoryFeedPageData>;
}

type PageDataRuntime = Parameters<typeof loadAccountTimeline>[0] &
  Parameters<typeof loadChatPage>[0] &
  Parameters<typeof loadMentionGraph>[0] &
  Parameters<typeof loadPlaceMap>[0] &
  Parameters<typeof loadStoryFeed>[0];

export function createPageData(runtime: PageDataRuntime, now?: Date): PageData {
  return {
    accountTimeline: async ({ data }) => {
      try {
        return await Promise.resolve(loadAccountTimeline(runtime, data, now));
      } catch (error) {
        // A server function call made while navigating in the browser only keeps an error's
        // message, so the router's not-found has to be thrown on the server for the page to
        // render the 404.
        if (error instanceof HTTPError && error.status === 404) {
          notFound({ throw: true });
        }

        throw error;
      }
    },
    chatPage: async () => await Promise.resolve(loadChatPage(runtime)),
    mentionGraph: async ({ data }) =>
      await Promise.resolve(loadMentionGraph(runtime, data.accounts)),
    placeMap: async () => await Promise.resolve(loadPlaceMap(runtime)),
    storyFeed: async ({ data }) =>
      await Promise.resolve(loadStoryFeed(runtime, now, data.date, data.story)),
  };
}
