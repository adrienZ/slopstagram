import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { Route } from "../app/routes/graph.tsx";
import { loadMentionGraph } from "../app/loaders/mention-graph.ts";
import { createPageRenderer } from "./render-page.ts";
import { useSharedTestRuntime } from "./setup/test-runtime.ts";
import { graphAccounts, seedGraphDatabase } from "./ui/seeded-pages.ts";

const shared = useSharedTestRuntime(seedGraphDatabase);

test("the server renders the settled graph, every point placed", async () => {
  const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime), "/graph");
  const html = await renderer.renderRoute("/graph");
  const page = within(new JSDOM(html).window.document.body);
  const points = within(page.getByRole("group", { name: "Points et connexions" })).getAllByRole(
    "button",
  );
  expect(points).toHaveLength(7);
  expect(points.map((point) => point.getAttribute("transform"))).not.toContain("translate(0 0)");
  expect(page.getByRole("button", { name: `@${graphAccounts[0]}` })).toBeDefined();
});
