import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { createPageRenderer } from "./render-page.ts";
import { Route } from "../server/pages/users/$username.tsx";
import { timelineProps } from "./page-fixtures.ts";

const renderer = createPageRenderer(Route, timelineProps, "/users/$username");

test("timeline SSR renders query data and defers its selected portal until hydration", async () => {
  const html = await renderer.renderRoute("/users/timeline-user?story=story-pk");
  const { document } = new JSDOM(html).window;
  const page = within(document.body);
  expect(page.getAllByRole("main")).toHaveLength(1);
  expect(page.getByRole("heading", { name: "Timeline User", level: 1 })).toBeDefined();
  expect(page.getByRole("button", { name: "Ouvrir aperçu story-pk" })).toBeDefined();
  expect(page.queryByRole("dialog")).toBeNull();
  expect(html).toContain("$_TSR");
  expect(html).not.toContain("<script>caption");
  expect(document.querySelector('script[type="application/json"]')).toBeNull();
});
