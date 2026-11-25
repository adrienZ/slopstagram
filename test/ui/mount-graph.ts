import { screen, within } from "@testing-library/react";
import type { MentionGraphPageData } from "../../app/loaders/mention-graph.ts";
import type { Route } from "../../app/routes/graph.tsx";
import type { createPageRenderer } from "../render-page.ts";

type GraphRenderer = ReturnType<typeof createPageRenderer<typeof Route, MentionGraphPageData>>;

export async function mountGraph(renderer: GraphRenderer, url = "/graph") {
  const mounted = await renderer.mountRoute(url);
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
