import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";
import { getAccountTimeline, type AccountTimelinePageData } from "./loaders/account-timeline.ts";
import { getChatPage, type ChatPageData } from "./loaders/chat.ts";
import { getMentionGraph, type MentionGraphPageData } from "./loaders/mention-graph.ts";
import { getPlaceMap, type PlaceMapPageData } from "./loaders/place-map.ts";
import { getStoryFeed, type StoryFeedPageData } from "./loaders/story-feed.ts";

/** What each page's route loader reads: the loaders' server functions, or their load functions in tests. */
export interface PageData {
  accountTimeline: (request: { data: string }) => Promise<AccountTimelinePageData>;
  chatPage: () => Promise<ChatPageData>;
  mentionGraph: (request: { data: { accounts: Array<string> } }) => Promise<MentionGraphPageData>;
  placeMap: () => Promise<PlaceMapPageData>;
  storyFeed: (request: { data: { date?: string; story?: string } }) => Promise<StoryFeedPageData>;
}

const pages: PageData = {
  accountTimeline: getAccountTimeline,
  chatPage: getChatPage,
  mentionGraph: getMentionGraph,
  placeMap: getPlaceMap,
  storyFeed: getStoryFeed,
};

/** Everything the application router is configured with except its route tree, so tests can reuse it. */
export const routerOptions = {
  // Avoid JSON parsing of numeric Instagram IDs; route schemas normalize primitive values to strings.
  parseSearch: parseSearchWith(String),
  stringifySearch: stringifySearchWith(JSON.stringify),
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultErrorComponent: () => <h1>500 : Erreur interne</h1>,
  defaultNotFoundComponent: () => <h1>404 : Page introuvable</h1>,
} as const;

export function getRouter() {
  return createRouter({ routeTree, context: { pages }, ...routerOptions });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
