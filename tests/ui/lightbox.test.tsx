import { beforeAll, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route as ReportRoute } from "../../server/pages/report.tsx";
import { Route as TimelineRoute } from "../../server/pages/users/$username.tsx";
import { loadReport } from "../../server/report-handler.tsx";
import { loadUserTimeline } from "../../server/user-timeline-handler.tsx";
import { createPageRenderer } from "../render-page.ts";
import { pageNow, seedPageDatabase, timelineAccount, today } from "./seeded-pages.ts";

// The lightbox keeps its state in the search parameters, so it is tested through the pages that host it.
const reportRenderer = createPageRenderer(ReportRoute, () => loadReport(pageNow), "/report");
const timelineRenderer = createPageRenderer(
  TimelineRoute,
  ({ params }) => loadUserTimeline(params.username, pageNow),
  "/users/$username",
);

// The report feed in the order the lightbox navigates it.
let stories: Array<{ mediaPk: string; alt: string; preview: string }>;

beforeAll(async () => {
  await seedPageDatabase();
  stories = loadReport(pageNow).users.flatMap((section) => section.stories);
});

test("buttons and arrow keys wrap through the gallery while preserving other search parameters", async () => {
  const [first, second] = stories;
  const last = stories.at(-1);
  const { user, router } = await reportRenderer.mountRoute(
    `/report?date=${today}&story=${first.mediaPk}`,
  );
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByRole("img", { name: first.alt })).toBeVisible();
  await user.click(dialog.getByRole("button", { name: "Image précédente" }));
  expect(router.state.location.href).toBe(`/report?date=${today}&story=${last?.mediaPk}`);
  await user.click(dialog.getByRole("button", { name: "Image suivante" }));
  expect(router.state.location.href).toBe(`/report?date=${today}&story=${first.mediaPk}`);
  await user.keyboard("{ArrowRight}");
  expect(router.state.location.href).toBe(`/report?date=${today}&story=${second.mediaPk}`);
  await user.keyboard("{ArrowLeft}");
  expect(router.state.location.href).toBe(`/report?date=${today}&story=${first.mediaPk}`);
  await user.keyboard("{Escape}");
  expect(router.state.location.href).toBe(`/report?date=${today}`);
  expect(screen.getByRole("button", { name: `Ouvrir aperçu ${first.mediaPk}` })).toHaveFocus();
});

test("the header username links to the profile only on the report page", async () => {
  const [{ mediaPk }] = stories;
  const report = await reportRenderer.mountRoute(`/report?story=${mediaPk}`);
  expect(
    within(await screen.findByRole("dialog")).getByRole("link", {
      name: new RegExp(timelineAccount, "u"),
    }),
  ).toHaveAttribute("href", `/users/${timelineAccount}`);
  report.unmount();

  await timelineRenderer.mountRoute(`/users/${timelineAccount}?story=${mediaPk}`);
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText(new RegExp(timelineAccount, "u"))).toBeVisible();
  expect(
    dialog.queryByRole("link", { name: new RegExp(timelineAccount, "u") }),
  ).not.toBeInTheDocument();
});

test("the preview is repeated as a blurred backdrop behind the image", async () => {
  const [{ alt, mediaPk, preview }] = stories;
  await reportRenderer.mountRoute(`/report?story=${mediaPk}`);
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByRole("img", { name: alt })).toHaveAttribute("src", preview);
  expect(dialog.getByTestId("lightbox-backdrop")).toHaveAttribute("src", preview);
  expect(dialog.getByTestId("lightbox-backdrop")).toHaveAttribute("aria-hidden", "true");
});
