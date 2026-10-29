import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ThemeProvider } from "../components/theme-provider.tsx";
import type { Queries } from "../query-service.ts";
import "../shadcn/styles.css";
import "../assets/css/base.css";

export function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Scripts />
        {import.meta.env.DEV && <script type="module" src="/__devtools/embedded.js" />}
      </body>
    </html>
  );
}

export function rootHead() {
  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  };
}

export interface RouterContext {
  queries: Queries;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: rootHead,
  component: Outlet,
  shellComponent: RootDocument,
});
