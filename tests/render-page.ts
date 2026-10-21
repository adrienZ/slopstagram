import { createRequire } from "node:module";
import { vi } from "vitest";
import { createComponent, Suspense } from "solid-js";
import type { Component, JSX } from "solid-js";
import { renderToString, renderToStringAsync } from "solid-js/web";
import type { RequestEvent } from "solid-js/web";
import { provideRequestEvent } from "solid-js/web/storage";
import { MetaProvider } from "@solidjs/meta";
import { StaticRouter, Route, query } from "@solidjs/router";
import type { RouteDefinition } from "@solidjs/router";
import type { ReportContentProps } from "../server/pages/report.tsx";
import type { TimelineContentProps } from "../server/pages/users/[username].tsx";

// SolidStart and Nitro currently resolve different h3 versions.
const startRequire = createRequire(import.meta.resolve("@solidjs/start/server"));
const { mockEvent } = await vi.importActual<{
  mockEvent: (request: string) => RequestEvent["nativeEvent"];
}>(startRequire.resolve("h3"));

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- Solid scopes request state to the callback through AsyncLocalStorage.
export function withRequest<T>(url: string, callback: () => T): T {
  return provideRequestEvent(
    {
      request: new globalThis.Request(`http://localhost${url}`),
      response: { headers: new globalThis.Headers() },
      nativeEvent: mockEvent(`http://localhost${url}`),
      locals: {},
    },
    callback,
  );
}

export function renderPage<Props extends object>(
  component: Component<Props>,
  props: Props,
  url: string,
): string {
  return renderToString(() =>
    createComponent(StaticRouter, {
      url,
      root: () =>
        createComponent(MetaProvider, {
          get children(): JSX.Element {
            return createComponent(component, props);
          },
        }),
    }),
  );
}

export async function renderRoute(options: {
  component: Component;
  route: RouteDefinition;
  path: string;
  url: string;
  queryKey: string;
  data: ReportContentProps | TimelineContentProps;
}): Promise<string> {
  return await withRequest(options.url, async () => {
    query.set(options.queryKey, options.data);
    return await renderToStringAsync(() =>
      createComponent(StaticRouter, {
        url: options.url,
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
            path: options.path,
            component: options.component,
            preload: options.route.preload,
          });
        },
      }),
    );
  });
}
