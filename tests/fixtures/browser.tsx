import { MetaProvider } from "@solidjs/meta";
import { MemoryRouter, Route, createMemoryHistory, query } from "@solidjs/router";
import { Suspense } from "solid-js";
import { render } from "solid-js/web";
import { vi } from "vitest";
import ReportRoute, { route as reportRoute } from "../../server/pages/report.tsx";
import TimelineRoute, { route as timelineRoute } from "../../server/pages/users/[username].tsx";

// Exercise the real routes with predictable data, without loading server-only code.
// oxlint-disable-next-line anti-slop/no-module-mocking -- Browser fixtures replace the server boundary with predictable query data.
vi.mock("../../server/query-service.ts", async () => {
  const { query: fixtureQuery } = await import("@solidjs/router");
  const { earlierReportKey, reportProps, timelineProps } = await import("./page-data.ts");
  const report = {
    ...reportProps,
    users: reportProps.users.map((user) => ({
      ...user,
      stories: user.stories.flatMap((story) => [
        { ...story, position: 1, count: 2 },
        { ...story, mediaPk: "story-pk-2", position: 2, count: 2 },
      ]),
    })),
  };
  return {
    getReport: fixtureQuery(
      // oxlint-disable-next-line typescript/require-await -- Keep the server query's async contract in this fixture.
      async (key: string | null) =>
        key === earlierReportKey
          ? { ...report, date: "25 juillet 2026", selectedReportKey: key }
          : report,
      "report",
    ),
    getUserTimeline: fixtureQuery(
      // oxlint-disable-next-line typescript/require-await -- Keep the server query's async contract in this fixture.
      async (_username: string) => timelineProps,
      "user-timeline",
    ),
  };
});

export function renderApp(path: string) {
  const history = createMemoryHistory();
  history.set({ value: path, replace: true });
  const container = globalThis.document.createElement("div");
  globalThis.document.body.append(container);
  const dispose = render(
    () => (
      <MemoryRouter
        history={history}
        root={(props) => (
          <MetaProvider>
            <Suspense>{props.children}</Suspense>
          </MetaProvider>
        )}
      >
        <Route path="/report" component={ReportRoute} preload={reportRoute.preload} />
        <Route path="/users/:username" component={TimelineRoute} preload={timelineRoute.preload} />
      </MemoryRouter>
    ),
    container,
  );
  return {
    url: () => new globalThis.URL(history.get(), "http://localhost"),
    cleanup() {
      dispose();
      container.remove();
      query.clear();
    },
  };
}
