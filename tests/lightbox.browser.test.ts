import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "./fixtures/browser.tsx";
import { earlierReportKey, latestReportKey } from "./fixtures/page-data.ts";

let app: ReturnType<typeof renderApp>;
afterEach(() => {
  app.cleanup();
});

test("opening and closing a story preserves the report and hash", async () => {
  app = renderApp(`/report?report=${latestReportKey}#stories`);

  await page.getByRole("button", { name: "Ouvrir aperçu story-pk-1", exact: true }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(app.url().searchParams.get("story")).toBe("story-pk-1");
  expect(app.url().searchParams.get("report")).toBe(latestReportKey);
  expect(app.url().hash).toBe("#stories");

  await page.getByRole("button", { name: "Fermer l’aperçu" }).click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(app.url().searchParams.has("story")).toBe(false);
  expect(app.url().searchParams.get("report")).toBe(latestReportKey);
  expect(app.url().hash).toBe("#stories");
});

test("lightbox arrows and buttons wrap between stories and keep the dialog open", async () => {
  app = renderApp("/report?story=story-pk-1");
  await expect.element(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("button", { name: "Image précédente" }).click();
  await expect.element(page.getByRole("cell", { name: "story-pk-2", exact: true })).toBeVisible();
  expect(app.url().searchParams.get("story")).toBe("story-pk-2");

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(page.getByRole("cell", { name: "story-pk-1", exact: true })).toBeVisible();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(page.getByRole("cell", { name: "story-pk-2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Image suivante" }).click();
  await expect.element(page.getByRole("cell", { name: "story-pk-1", exact: true })).toBeVisible();
  expect(app.url().searchParams.get("story")).toBe("story-pk-1");
});

test("Escape closes a deep-linked story", async () => {
  app = renderApp("/report?story=story-pk-1");
  await expect.element(page.getByRole("dialog")).toBeVisible();

  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(app.url().searchParams.has("story")).toBe(false);
});

test("an unknown story stays closed", async () => {
  app = renderApp("/report?story=missing");

  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});

test("content clicks keep the lightbox open and clicking the dialog surface closes it", async () => {
  app = renderApp("/report?story=story-pk-1");
  await expect.element(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("heading", { name: "Détails", exact: true }).click();
  expect(app.url().searchParams.get("story")).toBe("story-pk-1");

  globalThis.document.querySelector("dialog")?.click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(app.url().searchParams.has("story")).toBe(false);
});

test("choosing a report submits the selected report key", async () => {
  app = renderApp("/report");
  let submittedReport: FormDataEntryValue | null | undefined;
  globalThis.document.addEventListener(
    "submit",
    (event) => {
      // The picker intentionally performs a full GET navigation; keep the test iframe alive.
      event.preventDefault();
      if (event.target instanceof globalThis.HTMLFormElement) {
        expect(event.target.method).toBe("get");
        expect(new globalThis.URL(event.target.action).pathname).toBe("/report");
        submittedReport = new globalThis.FormData(event.target).get("report");
      }
    },
    { once: true },
  );

  await page.getByLabelText("Choisir un rapport", { exact: false }).selectOptions(earlierReportKey);
  expect(submittedReport).toBe(earlierReportKey);
});

test("the report query parameter selects the corresponding report content", async () => {
  app = renderApp(`/report?report=${earlierReportKey}`);

  await expect
    .element(page.getByRole("heading", { name: "Rapport du 25 juillet 2026", exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByLabelText("Choisir un rapport", { exact: false }))
    .toHaveValue(earlierReportKey);
  expect(app.url().searchParams.get("report")).toBe(earlierReportKey);
});

test("a user link opens its timeline, whose story uses the same URL state", async () => {
  app = renderApp("/report");

  await page.getByRole("link", { name: /ranked-second/u }).click();

  await expect
    .element(page.getByRole("heading", { name: "Timeline User (timeline-user)", exact: true }))
    .toBeVisible();
  expect(app.url().pathname).toBe("/users/ranked-second");
  await page.getByRole("button", { name: "Ouvrir aperçu story-pk", exact: true }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(app.url().searchParams.get("story")).toBe("story-pk");
  expect(globalThis.document.querySelector(".lightbox-next")).toHaveAttribute("hidden");
});
