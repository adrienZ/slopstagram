import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { Route } from "../app/routes/graph.tsx";
import { createPageData, createPageRenderer } from "./render-page.ts";
import { shareTestRuntime } from "./setup/test-runtime.ts";
import { graphAccounts, seedGraphDatabase } from "./setup/mention-graph-seed.ts";

const shared = shareTestRuntime(seedGraphDatabase);

test("the server renders the settled graph, every point placed", async () => {
  const renderer = createPageRenderer(Route, () => createPageData(shared.runtime), "/graph");
  const html = await renderer.renderRoute("/graph");
  const page = within(new JSDOM(html).window.document.body);
  const points = within(page.getByRole("group", { name: "Points" })).getAllByRole("button");
  expect(points).toHaveLength(7);
  expect(points.map((point) => point.getAttribute("transform"))).not.toContain("translate(0 0)");
  expect(page.getByRole("button", { name: `@${graphAccounts[0]}` })).toBeDefined();
});

test("the server renders the neighborhood an account filter in the URL names", async () => {
  const renderer = createPageRenderer(Route, () => createPageData(shared.runtime), "/graph");

  const html = await renderer.renderRoute(`/graph?accounts=${graphAccounts[1]}`);
  const page = within(new JSDOM(html).window.document.body);
  const points = within(page.getByRole("group", { name: "Points" })).getAllByRole("button");
  const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
  expect(points.map((point) => point.getAttribute("aria-label"))).toStrictEqual([cleo, ada, ben]);
});
