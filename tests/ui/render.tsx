import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  parseSearchWith,
  RouterProvider,
  stringifySearchWith,
  useSearch,
} from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { ThemeProvider } from "../../server/components/theme-provider.tsx";

function FixtureRoot() {
  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}

export async function renderPage<Props extends object>(
  Page: ComponentType<Props & { selectedStory?: string }>,
  props: Props,
  url = "/report",
  options: { beforeLoad?: () => Promise<void> } = {},
) {
  const user = userEvent.setup();
  function PageWithSearch() {
    const search = useSearch({ strict: false });
    return <Page {...props} selectedStory={search.story} />;
  }
  const root = createRootRoute({ component: FixtureRoot });
  const route = createRoute({
    getParentRoute: () => root,
    path: url.split("?")[0],
    validateSearch: (search) => search,
    beforeLoad: options.beforeLoad,
    component: PageWithSearch,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [url] }),
    parseSearch: parseSearchWith(String),
    stringifySearch: stringifySearchWith(JSON.stringify),
    defaultPendingMinMs: 0,
  });
  await router.load();
  return { user, router, ...render(<RouterProvider router={router} />) };
}

export async function renderContent(children: ReactNode, url = "/report") {
  function Content() {
    return <>{children}</>;
  }
  return await renderPage(Content, {}, url);
}
