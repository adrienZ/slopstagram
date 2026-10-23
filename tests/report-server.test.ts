import { expect, test } from "vitest";
import { within } from "@testing-library/dom";
import { JSDOM } from "jsdom";
import { createPageRenderer } from "./render-page.ts";
import { Route } from "../server/pages/report.tsx";
import { reportProps } from "./page-fixtures.ts";

const renderer = createPageRenderer(Route, reportProps, "/report");

function readDocument(html: string) {
  return new JSDOM(html).window.document;
}

test("report SSR includes the feed and safely serializes hydration data", async () => {
  const html = await renderer.renderRoute("/report?story=story-pk-1");
  const document = readDocument(html);
  const page = within(document.body);
  expect(page.getAllByRole("main")).toHaveLength(1);
  expect(page.getByRole("heading", { name: "Stories des dernières 24 heures" })).toBeDefined();
  expect(page.getByRole("button", { name: "Ouvrir aperçu story-pk-1" })).toBeDefined();
  expect(page.queryByRole("dialog")).toBeNull();
  expect(document.querySelector('link[href^="/css/"]')).toBeNull();
  expect(html).toContain("$_TSR");
  expect(html).not.toContain("<script>caption");
});

test("report SSR isolates loader data between concurrent requests", async () => {
  const [first, second] = await Promise.all([
    renderer.renderRoute("/report", { ...reportProps, date: "première requête" }),
    renderer.renderRoute("/report", { ...reportProps, date: "deuxième requête" }),
  ]);
  const firstPage = within(readDocument(first).body);
  const secondPage = within(readDocument(second).body);
  expect(firstPage.getByText("Fil chargé le première requête")).toBeDefined();
  expect(firstPage.queryByText(/deuxième requête/u)).toBeNull();
  expect(secondPage.getByText("Fil chargé le deuxième requête")).toBeDefined();
  expect(secondPage.queryByText(/première requête/u)).toBeNull();
});

test("invalid report dates preserve story IDs while falling back to today", () => {
  const validate = Route.options.validateSearch;
  expect(validate).toBeDefined();
  if (!validate || !("parse" in validate)) {
    throw new Error("Missing search schema");
  }
  expect(validate.parse({ date: "2026-02-30", story: "12345678901234567890" })).toEqual({
    date: undefined,
    story: "12345678901234567890",
  });
});

for (const mediaPk of ["12345", "12345678901234568000", "12345678901234567890"]) {
  test(`SSR preserves numeric Instagram ID ${mediaPk} without precision loss`, async () => {
    const html = await renderer.renderRoute(`/report?story=${mediaPk}`, {
      ...reportProps,
      users: reportProps.users.map((user) => ({
        ...user,
        stories: user.stories.map((story) => ({ ...story, mediaPk })),
      })),
    });
    expect(
      within(readDocument(html).body).getByRole("button", { name: `Ouvrir aperçu ${mediaPk}` }),
    ).toBeDefined();
    expect(html).toContain(mediaPk);
  });
}
