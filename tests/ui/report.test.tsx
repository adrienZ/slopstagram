import { expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { ReportPage } from "../../server/pages/report.tsx";
import { reportProps } from "../page-fixtures.ts";
import { renderPage } from "./render.tsx";

function getPreviousMonthButton() {
  return screen.getByRole("button", { name: /mois précédent/iu });
}

test("the feed renders ranked users, separate handles, summaries, and local previews", async () => {
  await renderPage(ReportPage, reportProps);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Stories des dernières 24 heures",
  );
  expect(screen.getByText(`Fil chargé le ${reportProps.date}`)).toBeVisible();
  const headings = screen.getAllByRole("heading", { level: 2 });
  expect(headings.map((heading) => heading.textContent)).toEqual(["Ranked First", 'Html "User"']);
  expect(screen.getByText("@ranked-second")).toBeVisible();
  expect(screen.getAllByText("A text-focused story with extracted details.")).toHaveLength(2);
  for (const image of screen.getAllByRole("img")) {
    expect(image.getAttribute("src")).toMatch(/^\/media\//u);
  }
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("today and historical empty states describe their different time windows", async () => {
  const today = await renderPage(ReportPage, { ...reportProps, users: [] });
  expect(screen.getByText("Aucune story publiée dans les dernières 24 heures.")).toBeVisible();
  today.unmount();
  await renderPage(ReportPage, { ...reportProps, selectedDate: "2026-07-25", users: [] });
  expect(screen.getByRole("heading", { name: "Stories du 25 juillet 2026" })).toBeVisible();
  expect(screen.getByText("Aucune story publiée ce jour-là.")).toBeVisible();
  expect(screen.queryByText(/Fil chargé le/u)).not.toBeInTheDocument();
});

test("calendar disables future and empty days, preserving today's marker on a past selection", async () => {
  await renderPage(ReportPage, { ...reportProps, selectedDate: "2026-07-25" });
  expect(screen.getByRole("button", { name: /24 juillet 2026/u })).toBeDisabled();
  expect(screen.getByRole("button", { name: /25 juillet 2026/u })).toBeEnabled();
  expect(screen.getByRole("button", { name: /27 juillet 2026/u })).toBeDisabled();
  expect(screen.getByRole("button", { name: /25 juillet 2026/u }).closest("td")).toHaveAttribute(
    "data-selected",
    "true",
  );
  expect(
    within(screen.getByRole("grid"))
      .getByRole("button", { name: /26 juillet 2026/u })
      .closest("td"),
  ).toHaveAttribute("data-today", "true");
});

test("saved users are linked with handles and can be collapsed and reopened", async () => {
  const { user } = await renderPage(ReportPage, reportProps);
  const navigation = within(screen.getByRole("navigation", { name: "Utilisateurs" }));
  expect(navigation.getByRole("link", { name: /@outside-feed/u })).toHaveAttribute(
    "href",
    "/users/outside-feed",
  );
  const toggle = navigation.getByRole("button", { name: "Utilisateurs" });
  await user.click(toggle);
  expect(navigation.queryByRole("link")).not.toBeInTheDocument();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await user.click(toggle);
  expect(navigation.getByRole("link", { name: /@outside-feed/u })).toBeVisible();
});

test("report calendar stops at the oldest available month across a year boundary", async () => {
  const { user } = await renderPage(ReportPage, {
    ...reportProps,
    selectedDate: "2026-02-02",
    availableDates: ["2026-01-15", "2025-12-20", "2026-02-02"],
  });
  expect(getPreviousMonthButton()).not.toHaveAttribute("aria-disabled", "true");
  await user.click(getPreviousMonthButton());
  expect(getPreviousMonthButton()).not.toHaveAttribute("aria-disabled", "true");
  await user.click(getPreviousMonthButton());
  expect(screen.getByRole("grid", { name: /décembre 2025/iu })).toBeVisible();
  expect(screen.getByRole("button", { name: /20 décembre 2025/u })).toBeEnabled();
  expect(getPreviousMonthButton()).toHaveAttribute("aria-disabled", "true");
  await user.click(getPreviousMonthButton());
  expect(screen.getByRole("grid", { name: /décembre 2025/iu })).toBeVisible();
  await user.click(screen.getByRole("button", { name: /mois suivant/iu }));
  expect(screen.getByRole("grid", { name: /janvier 2026/iu })).toBeVisible();
  expect(getPreviousMonthButton()).not.toHaveAttribute("aria-disabled", "true");
});

test("report calendar with no available data cannot navigate before today’s month", async () => {
  await renderPage(ReportPage, { ...reportProps, availableDates: [], users: [] });
  expect(screen.getByRole("button", { name: /mois précédent/iu })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("button", { name: /mois suivant/iu })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("opening a preview updates the real router and closing restores focus and search", async () => {
  const { user, router } = await renderPage(ReportPage, reportProps, "/report?date=2026-07-26");
  const preview = screen.getByRole("button", { name: "Ouvrir aperçu story-pk-1" });
  await user.click(preview);
  const dialog = await screen.findByRole("dialog", { name: "Aperçu de l’image" });
  expect(router.state.location.search).toEqual({ date: "2026-07-26", story: "story-pk-1" });
  expect(
    within(dialog).getByRole("cell", { name: "</script><script>caption</script>" }),
  ).toBeVisible();
  expect(within(dialog).getByRole("cell", { name: "apple <text>" })).toBeVisible();
  expect(
    within(dialog).getByRole("link", { name: "Voir cette story sur Instagram" }),
  ).toHaveAttribute("target", "_blank");
  await user.click(within(dialog).getByRole("button", { name: "Fermer l’aperçu" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(router.state.location.search).toEqual({ date: "2026-07-26" });
  expect(preview).toHaveFocus();
});

test("a story deep link opens after mount and an unknown story stays closed", async () => {
  const page = await renderPage(ReportPage, reportProps, "/report?story=story-pk-1");
  expect(await screen.findByRole("dialog")).toBeVisible();
  page.unmount();
  await renderPage(ReportPage, reportProps, "/report?story=missing");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
