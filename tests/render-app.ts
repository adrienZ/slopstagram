import { createRequestHandler, defaultRenderHandler } from "@tanstack/react-router/ssr/server";
import type { Queries } from "../server/query-service.ts";
import { getRouter } from "../server/router.tsx";

/**
 * Server-renders a URL with the application router, route tree and loaders. Only the
 * data source differs from production: it comes through the router context.
 */
export async function renderApp(url: string, queries: Queries): Promise<Response> {
  const handler = createRequestHandler({
    request: new globalThis.Request(`http://localhost${url}`),
    createRouter: () => getRouter({ queries }),
  });
  return await handler(defaultRenderHandler);
}
