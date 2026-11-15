import { screen, within } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import type { MentionGraphPageData } from "../../app/loaders/mention-graph.ts";
import type { Route } from "../../app/routes/graph.tsx";
import type { createPageRenderer } from "../render-page.ts";

type GraphRenderer = ReturnType<typeof createPageRenderer<typeof Route, MentionGraphPageData>>;

export function stubGraphLayout() {
  beforeEach(() => {
    // jsdom lays nothing out: the graph's drawing gets the size of its viewBox, at the origin.
    vi.spyOn(globalThis.Element.prototype, "getBoundingClientRect").mockImplementation(
      function measure(this: Element) {
        return globalThis.DOMRect.fromRect(
          this instanceof globalThis.SVGSVGElement ? { width: 1000, height: 700 } : {},
        );
      },
    );
  });
}

export async function mountGraph(renderer: GraphRenderer) {
  const mounted = await renderer.mountRoute("/graph");
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
