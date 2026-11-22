import { screen, within } from "@testing-library/react";
import { beforeEach } from "vitest";
import type { MentionGraphPageData } from "../../app/loaders/mention-graph.ts";
import type { Route } from "../../app/routes/graph.tsx";
import type { createPageRenderer } from "../render-page.ts";
import { mockJsdomPolyfillValue } from "../setup/define-property.ts";

type GraphRenderer = ReturnType<typeof createPageRenderer<typeof Route, MentionGraphPageData>>;

function getBoundingClientRect(this: Element) {
  return globalThis.DOMRect.fromRect(
    this instanceof globalThis.SVGSVGElement ? { width: 1000, height: 700 } : {},
  );
}

export function stubGraphLayout() {
  beforeEach(() => {
    // jsdom lays nothing out: the graph's drawing gets the size of its viewBox, at the origin.
    mockJsdomPolyfillValue(globalThis.Element.prototype, "getBoundingClientRect", {
      value: getBoundingClientRect,
    });
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
