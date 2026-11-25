import { screen, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MentionGraphCanvasContext } from "../../app/components/mention-graph-canvas-context.ts";
import type { MentionGraphPageData } from "../../app/loaders/mention-graph.ts";
import type { Route } from "../../app/routes/graph.tsx";
import type { createPageRenderer } from "../render-page.ts";

type GraphRenderer = ReturnType<typeof createPageRenderer<typeof Route, MentionGraphPageData>>;

// jsdom has no canvas: only force-graph's drawing is left out, the accessible buttons stay.
function TestGraphCanvas() {
  return null;
}

export function GraphWrapper({ children }: { children: ReactNode }) {
  return createElement(MentionGraphCanvasContext, { value: TestGraphCanvas }, children);
}

export async function mountGraph(renderer: GraphRenderer, url = "/graph") {
  const mounted = await renderer.mountRoute(url, undefined, { wrapper: GraphWrapper });
  const region = within(await screen.findByRole("region", { name: "Graphe des mentions" }));
  const drawing = region.getByRole("group", { name: "Points et connexions" });

  return {
    ...mounted,
    region,
    drawing,
    canvas: within(drawing),
    points: within(within(drawing).getByRole("group", { name: "Points" })),
    lines: within(within(drawing).getByRole("group", { name: "Connexions" })),
  };
}
