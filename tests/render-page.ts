import { createServer, isRunnableDevEnvironment } from "vite";
import solid from "vite-plugin-solid";
import { createRequire } from "node:module";
import type {
  Component,
  JSX,
  createComponent as SolidCreateComponent,
  Suspense as SolidSuspense,
} from "solid-js";
import type * as SolidWeb from "solid-js/web";
import type * as SolidStorage from "solid-js/web/storage";
import type * as SolidMeta from "@solidjs/meta";
import type * as SolidRouter from "@solidjs/router";
import type { ReportContentProps } from "../server/pages/report.tsx";
import type { TimelineContentProps } from "../server/pages/users/[username].tsx";

type PageProps = ReportContentProps | TimelineContentProps;

// SolidStart and Nitro currently resolve different h3 versions.
const startRequire = createRequire(import.meta.resolve("@solidjs/start/server"));

export async function createPageRenderer(
  path: string,
  name: string,
  props: PageProps,
  routeFixture: {
    path: string;
    queryModule: string;
    queryName: string;
    args: Array<string | null>;
  },
): Promise<{
  close: () => Promise<void>;
  render: (url?: string) => string;
  renderRoute: (url: string, requestProps?: PageProps) => Promise<string>;
}> {
  const vite = await createServer({
    configFile: false,
    plugins: [solid({ ssr: true, hot: false })],
    appType: "custom",
    server: { middlewareMode: true, watch: null, ws: false },
    ssr: { noExternal: ["solid-js", "@solidjs/meta", "@solidjs/router"] },
  });
  if (!isRunnableDevEnvironment(vite.environments.ssr)) {
    throw new Error("Vite SSR environment is not runnable");
  }
  const { runner } = vite.environments.ssr;
  const { mockEvent } = await runner.import<{
    mockEvent: (request: string) => SolidWeb.RequestEvent["nativeEvent"];
  }>(startRequire.resolve("h3"));
  const { renderToString, renderToStringAsync } =
    await runner.import<typeof SolidWeb>("solid-js/web");
  const { provideRequestEvent } = await runner.import<typeof SolidStorage>("solid-js/web/storage");
  const { createComponent, Suspense } = await runner.import<{
    createComponent: typeof SolidCreateComponent;
    Suspense: typeof SolidSuspense;
  }>("solid-js");
  const { MetaProvider } = await runner.import<typeof SolidMeta>("@solidjs/meta");
  const { StaticRouter, Route, query } = await runner.import<typeof SolidRouter>("@solidjs/router");
  const page = await runner.import<Record<string, Component<PageProps>>>(path);
  const routePage = await runner.import<{ default: Component; route: SolidRouter.RouteDefinition }>(
    path,
  );
  const queries = await runner.import<
    Record<string, { keyFor: (...args: Array<string | null>) => string }>
  >(routeFixture.queryModule);
  return {
    close: async () => {
      await vite.close();
    },
    render: (url = "/report") =>
      renderToString(() =>
        createComponent(StaticRouter, {
          url,
          root: () =>
            createComponent(MetaProvider, {
              get children(): JSX.Element {
                return createComponent(page[name], props);
              },
            }),
        }),
      ),
    renderRoute: async (url, requestProps = props) =>
      await provideRequestEvent(
        {
          request: new globalThis.Request(`http://localhost${url}`),
          response: { headers: new globalThis.Headers() },
          nativeEvent: mockEvent(`http://localhost${url}`),
          locals: {},
        },
        async () => {
          query.set(queries[routeFixture.queryName].keyFor(...routeFixture.args), requestProps);
          return await renderToStringAsync(() =>
            createComponent(StaticRouter, {
              url,
              root: (routeProps) =>
                createComponent(MetaProvider, {
                  get children(): JSX.Element {
                    return createComponent(Suspense, {
                      get children(): JSX.Element {
                        return routeProps.children;
                      },
                    });
                  },
                }),
              get children(): JSX.Element {
                return createComponent(Route, {
                  path: routeFixture.path,
                  component: routePage.default,
                  preload: routePage.route.preload,
                });
              },
            }),
          );
        },
      ),
  };
}
