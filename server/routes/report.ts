import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { defineEventHandler } from "nitro/h3";
import { ReportPage } from "../pages/report-page.tsx";
import { loadReport } from "../report-handler.tsx";

// oxlint-disable-next-line import/default -- Nitro generates the default asset manifest for this query import.
import clientAssets from "../../app/entry-client.tsx?assets=client";

export default defineEventHandler((event) => {
  try {
    const props = loadReport(event);
    return new globalThis.Response(
      `<!DOCTYPE html>${renderToString(h(ReportPage, { ...props, clientEntry: clientAssets.entry }))}`,
      {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      },
    );
  } catch (error) {
    return new globalThis.Response(error instanceof Error ? error.message : String(error), {
      status: 404,
    });
  }
});
