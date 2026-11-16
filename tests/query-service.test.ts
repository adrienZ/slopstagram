import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import type { AnyRoute } from "@tanstack/react-router";
import { Route as ChatRoute } from "../app/routes/chat.tsx";
import { Route as GraphRoute } from "../app/routes/graph.tsx";
import { Route as MapRoute } from "../app/routes/map.tsx";
import { Route as ReportRoute } from "../app/routes/report.tsx";
import { servePage } from "./render-page.ts";

const pages: Array<{ route: AnyRoute; path: string; heading: string }> = [
  { route: ReportRoute, path: "/report", heading: "Stories des dernières 24 heures" },
  { route: ChatRoute, path: "/chat", heading: "Assistant" },
  { route: MapRoute, path: "/map", heading: "Carte" },
  { route: GraphRoute, path: "/graph", heading: "Graphe des mentions" },
];

test.for(pages)("$path loads its data through its server function", async (page) => {
  const html = await servePage(page.route, page.path, page.path);

  expect(
    within(new JSDOM(html).window.document.body).getByRole("heading", {
      name: page.heading,
      level: 1,
    }),
  ).toBeDefined();
});
