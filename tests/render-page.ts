import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createRequestHandler, defaultRenderHandler } from "@tanstack/react-router/ssr/server";
import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { ThemeProvider } from "../app/components/theme-provider.tsx";
import { RootDocument, rootHead } from "../app/routes/__root.tsx";
import { loadAccountTimeline, notFoundOn404 } from "../app/loaders/account-timeline.ts";
import { loadChatPage } from "../app/loaders/chat.ts";
import { loadMentionGraph } from "../app/loaders/mention-graph.ts";
import { loadPlaceMap } from "../app/loaders/place-map.ts";
import { loadStoryFeed } from "../app/loaders/story-feed.ts";
import { routerOptions, type PageData } from "../app/router.tsx";

/** The page's real route loader runs; `pages` answers it as the server functions do in production. It is called per render, once a test's runtime exists. */
export function createPageRenderer(fileRoute: AnyRoute, pages: () => PageData, path: string) {
  // Clone routes so concurrent renders never share loader state.
  function cloneRoute(root: AnyRoute, beforeLoad?: () => Promise<void>) {
    return createRoute({
      ...fileRoute.options,
      // routeTree.gen.ts gives the real route an id; the clone gets a path instead.
      id: undefined,
      getParentRoute: () => root,
      path,
      beforeLoad: async (context) => {
        await beforeLoad?.();

        // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-call -- AnyRoute types the route's own beforeLoad as any.
        return await fileRoute.options.beforeLoad?.(context);
      },
    });
  }

  return {
    renderRoute: async (url: string, overrides: Partial<PageData> = {}) => {
      const handler = createRequestHandler({
        request: new globalThis.Request(`http://localhost${url}`),
        createRouter: () => {
          const root = createRootRoute({ shellComponent: RootDocument, head: rootHead });

          return createRouter({
            routeTree: root.addChildren([cloneRoute(root)]),
            context: { pages: { ...pages(), ...overrides } },
            ...routerOptions,
          });
        },
      });

      const response = await handler(defaultRenderHandler);

      return await response.text();
    },
    mountRoute: async (
      url: string,
      overrides: Partial<PageData> = {},
      options: {
        beforeLoad?: () => Promise<void>;
        wrapper?: ComponentType<{ children: ReactNode }>;
      } = {},
    ) => {
      const root = createRootRoute({
        component: () => createElement(ThemeProvider, null, createElement(Outlet)),
      });

      const router = createRouter({
        routeTree: root.addChildren([cloneRoute(root, options.beforeLoad)]),
        context: { pages: { ...pages(), ...overrides } },
        history: createMemoryHistory({ initialEntries: [url] }),
        defaultPendingMinMs: 0,
        ...routerOptions,
      });

      await router.load();

      return {
        user: userEvent.setup(),
        router,
        ...render(createElement(RouterProvider, { router }), { wrapper: options.wrapper }),
      };
    },
  };
}

/** Answers a page's route loader with data a test shaped itself. */
export function pageDataOf<Data>(data: Data) {
  return async () => await Promise.resolve(data);
}

type PageDataRuntime = Parameters<typeof loadAccountTimeline>[0] &
  Parameters<typeof loadChatPage>[0] &
  Parameters<typeof loadMentionGraph>[0] &
  Parameters<typeof loadPlaceMap>[0] &
  Parameters<typeof loadStoryFeed>[0];

/** The page data the server functions serve, read over a test's runtime instead. */
export function createPageData(runtime: PageDataRuntime, now?: Date): PageData {
  return {
    accountTimeline: async ({ data }) =>
      await Promise.resolve(notFoundOn404(() => loadAccountTimeline(runtime, data, now))),
    chatPage: async () => await Promise.resolve(loadChatPage(runtime)),
    mentionGraph: async ({ data }) =>
      await Promise.resolve(loadMentionGraph(runtime, data.accounts)),
    placeMap: async () => await Promise.resolve(loadPlaceMap(runtime)),
    storyFeed: async ({ data }) =>
      await Promise.resolve(loadStoryFeed(runtime, now, data.date, data.story)),
  };
}
