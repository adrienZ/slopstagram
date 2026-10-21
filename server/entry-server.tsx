// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import { HTTPError } from "nitro/h3";
import { loadReport } from "./report-handler.tsx";
import { loadUserTimeline } from "./user-timeline-handler.tsx";

export default createHandler((event) => {
  const url = new globalThis.URL(event.request.url);
  const pathname = url.pathname.replace(/\/+$/u, "");
  if (pathname === "/report") {
    event.locals.page = { page: "report", props: loadReport(url) };
  } else if (pathname.startsWith("/users/")) {
    event.locals.page = {
      page: "timeline",
      props: loadUserTimeline(decodeURIComponent(pathname.slice("/users/".length))),
    };
  } else {
    throw new HTTPError({ status: 404, message: "Not Found" });
  }
  return (
    <StartServer
      document={(props) => (
        <html lang="fr">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            {props.assets}
          </head>
          <body>
            <div id="app">{props.children}</div>
            {props.scripts}
          </body>
        </html>
      )}
    />
  );
});
