import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "../shadcn/styles.css";
import "../assets/css/base.css";

export function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        <main className="tw:mx-auto tw:max-w-360 tw:px-6 tw:pt-8 tw:pb-12 tw:max-[760px]:px-4 tw:max-[760px]:py-6">
          {children}
        </main>
        <Scripts />
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

export const Route = createRootRoute({
  head: rootHead,
  component: Outlet,
  shellComponent: RootDocument,
});
