import { createServer, isRunnableDevEnvironment } from "vite";
import solid from "vite-plugin-solid";
import type { Component, JSX } from "solid-js";
import type * as Solid from "solid-js";
import type * as SolidWeb from "solid-js/web";
import type * as SolidMeta from "@solidjs/meta";
import type { ReportContentProps } from "../server/pages/report.tsx";
import type { TimelineContentProps } from "../server/pages/users/[username].tsx";

type PageProps = ReportContentProps | TimelineContentProps;

export async function createPageRenderer(
  path: string,
  name: string,
  props: PageProps,
): Promise<{ close: () => Promise<void>; render: () => string }> {
  const vite = await createServer({
    configFile: false,
    plugins: [solid({ ssr: true, hot: false })],
    appType: "custom",
    server: { middlewareMode: true, watch: null, ws: false },
    ssr: { noExternal: ["solid-js", "@solidjs/meta", "@nanostores/solid"] },
  });
  if (!isRunnableDevEnvironment(vite.environments.ssr)) {
    throw new Error("Vite SSR environment is not runnable");
  }
  const { runner } = vite.environments.ssr;
  const { renderToString } = await runner.import<typeof SolidWeb>("solid-js/web");
  const { createComponent } = await runner.import<typeof Solid>("solid-js");
  const { MetaProvider } = await runner.import<typeof SolidMeta>("@solidjs/meta");
  const page = await runner.import<Record<string, Component<PageProps>>>(path);
  return {
    close: async () => {
      await vite.close();
    },
    render: () =>
      renderToString(() =>
        createComponent(MetaProvider, {
          get children(): JSX.Element {
            return createComponent(page[name], props);
          },
        }),
      ),
  };
}
