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
import { runWithStartContext } from "@tanstack/start-storage-context";
import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { migrateDatabase } from "@@/core/domains/database/migrate.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";
import { ThemeProvider } from "../app/components/theme-provider.tsx";
import { RootDocument, rootHead } from "../app/routes/__root.tsx";
import { getRouter, routerOptions } from "../app/router.tsx";

type LoaderContext<Route extends AnyRoute> = Parameters<
  Extract<NonNullable<Route["options"]["loader"]>, (context: never) => object | Promise<object>>
>[0];

type PageProps<Route extends AnyRoute, Props extends object> =
  | Props
  | ((context: LoaderContext<Route>) => Props);

// Clone routes so concurrent renders never share loader state.
function cloneRoute<Route extends AnyRoute>(
  fileRoute: Route,
  path: string,
  root: AnyRoute,
  loader: Route["options"]["loader"],
  beforeLoad?: () => Promise<void>,
) {
  return createRoute({
    ...fileRoute.options,
    // routeTree.gen.ts gives the real route an id; the clone gets a path instead.
    id: undefined,
    getParentRoute: () => root,
    path,
    loader,
    beforeLoad: async (context) => {
      await beforeLoad?.();

      // oxlint-disable-next-line typescript/no-unsafe-return, typescript/no-unsafe-call -- AnyRoute types the route's own beforeLoad as any.
      return await fileRoute.options.beforeLoad?.(context);
    },
  });
}

function createServerRouter<Route extends AnyRoute>(
  fileRoute: Route,
  path: string,
  loader: Route["options"]["loader"],
) {
  const root = createRootRoute({ shellComponent: RootDocument, head: rootHead });

  return createRouter({
    routeTree: root.addChildren([cloneRoute(fileRoute, path, root, loader)]),
    ...routerOptions,
  });
}

async function renderHtml(request: Request, router: ReturnType<typeof createServerRouter>) {
  const handler = createRequestHandler({ request, createRouter: () => router });
  const response = await handler(defaultRenderHandler);

  return await response.text();
}

/**
 * Renders the route with its own loader, so its server function reads the production runtime,
 * an empty in-memory database in tests, as the server does.
 */
export async function servePage(fileRoute: AnyRoute, path: string, url: string) {
  // The server migrates its database on startup (nitro/plugins/database.ts).
  migrateDatabase(getProductionRuntime().database);
  const request = new globalThis.Request(`http://localhost${url}`);
  const router = createServerRouter(fileRoute, path, fileRoute.options.loader);

  return await runWithStartContext(
    {
      getRouter,
      request,
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      handlerType: "router",
    },
    async () => await renderHtml(request, router),
  );
}

/** Answers the route's loader with `props`, which the test loads from its own runtime. */
export function createPageRenderer<Route extends AnyRoute, Props extends object>(
  fileRoute: Route,
  props: PageProps<Route, Props>,
  path: string,
) {
  function answer(requestProps: PageProps<Route, Props>) {
    return (context: LoaderContext<Route>) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Props is an object type, so only the function form is callable.
      typeof requestProps === "function" ? requestProps(context) : requestProps;
  }

  return {
    renderRoute: async (url: string, requestProps = props) =>
      await renderHtml(
        new globalThis.Request(`http://localhost${url}`),
        createServerRouter(fileRoute, path, answer(requestProps)),
      ),
    mountRoute: async (
      url: string,
      mountProps = props,
      options: {
        beforeLoad?: () => Promise<void>;
        wrapper?: ComponentType<{ children: ReactNode }>;
      } = {},
    ) => {
      const root = createRootRoute({
        component: () => createElement(ThemeProvider, null, createElement(Outlet)),
      });

      const router = createRouter({
        routeTree: root.addChildren([
          cloneRoute(fileRoute, path, root, answer(mountProps), options.beforeLoad),
        ]),
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
