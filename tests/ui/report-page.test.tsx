import { expect, test } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { ReportPage } from "../../server/pages/report.tsx";
import {
  appleCaption,
  captionedStoryPk,
  hostileCaption,
  mentionedAccount,
  namedAccount,
  outsideFeedAccount,
  today,
  userSummary,
} from "./page-data.ts";
import {
  emptyDayReportProps,
  emptyTodayReportProps,
  pastReportProps,
  reportProps,
} from "./page-props.ts";
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
  expect(headings.map((heading) => heading.textContent)).toEqual([
    namedAccount.fullName,
    "@user_075",
  ]);
  // Once in the sidebar and once under the display name of its section.
  expect(screen.getAllByText(`@${namedAccount.username}`)).toHaveLength(2);
  expect(screen.getAllByText(userSummary)).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: /Ouvrir aperçu/u })).toHaveLength(2);
  for (const image of screen.getAllByRole("img")) {
    expect(image.getAttribute("src")).toMatch(/^\/media\//u);
  }
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("today and historical empty states describe their different time windows", async () => {
  const todayPage = await renderPage(ReportPage, emptyTodayReportProps);
  expect(screen.getByText("Aucune story publiée dans les dernières 24 heures.")).toBeVisible();
  todayPage.unmount();
  await renderPage(ReportPage, emptyDayReportProps);
  expect(screen.getByRole("heading", { name: "Stories du 24 juillet 2026" })).toBeVisible();
  expect(screen.getByText("Aucune story publiée ce jour-là.")).toBeVisible();
  expect(screen.queryByText(/Fil chargé le/u)).not.toBeInTheDocument();
});

test("a past day lists the stories published that day without the loaded-at line", async () => {
  await renderPage(ReportPage, pastReportProps);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Stories du 25 juillet 2026");
  expect(screen.queryByText(/Fil chargé le/u)).not.toBeInTheDocument();
  expect(
    screen.getAllByRole("heading", { level: 2 }).map(({ textContent }) => textContent),
  ).toEqual(["@user_075"]);
});

test("calendar disables future and empty days, preserving today's marker on a past selection", async () => {
  await renderPage(ReportPage, pastReportProps);
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
  expect(
    navigation.getByRole("link", {
      name: new RegExp(`@${outsideFeedAccount}`, "u"),
    }),
  ).toHaveAttribute("href", `/users/${outsideFeedAccount}`);
  const toggle = navigation.getByRole("button", { name: "Utilisateurs" });
  await user.click(toggle);
  expect(navigation.queryByRole("link")).not.toBeInTheDocument();
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await user.click(toggle);
  expect(
    navigation.getByRole("link", {
      name: new RegExp(`@${outsideFeedAccount}`, "u"),
    }),
  ).toBeVisible();
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
  await renderPage(ReportPage, {
    ...emptyTodayReportProps,
    availableDates: [],
  });
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
  const { user, router } = await renderPage(ReportPage, reportProps, `/report?date=${today}`);
  const preview = screen.getByRole("button", {
    name: `Ouvrir aperçu ${captionedStoryPk}`,
  });
  await user.click(preview);
  const dialog = await screen.findByRole("dialog", {
    name: "Aperçu de l’image",
  });
  expect(router.state.location.search).toMatchObject({ date: today });
  expect(String(router.state.location.search.story)).toBe(captionedStoryPk);
  expect(within(dialog).getByRole("cell", { name: hostileCaption })).toBeVisible();
  expect(within(dialog).getByRole("cell", { name: appleCaption })).toBeVisible();
  expect(
    within(dialog).getByRole("link", {
      name: "Voir cette story sur Instagram",
    }),
  ).toHaveAttribute("target", "_blank");
  await user.click(within(dialog).getByRole("button", { name: "Fermer l’aperçu" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(router.state.location.search).toEqual({ date: today });
  expect(preview).toHaveFocus();
});

test("a story deep link opens after mount and an unknown story stays closed", async () => {
  const page = await renderPage(ReportPage, reportProps, `/report?story=${captionedStoryPk}`);
  expect(await screen.findByRole("dialog")).toBeVisible();
  page.unmount();
  await renderPage(ReportPage, reportProps, "/report?story=missing");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("closing story details hides the dialog immediately while route navigation is pending", async (context) => {
  let delayNavigation = false;
  const { promise: pending, resolve: release } = Promise.withResolvers<null>();
  const { user, router } = await renderPage(
    ReportPage,
    reportProps,
    `/report?story=${captionedStoryPk}`,
    {
      beforeLoad: async () => {
        if (delayNavigation) {
          await pending;
        }
      },
    },
  );
  context.onTestFinished(() => {
    release(null);
  });
  delayNavigation = true;
  await user.click(screen.getByRole("button", { name: "Fermer l’aperçu" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(router.state.isLoading).toBe(true);
  release(null);
  await waitFor(() => {
    expect(router.state.location.search.story).toBeUndefined();
  });
});

test("report details link the mentions of a saved account to its page", async () => {
  await renderPage(ReportPage, reportProps, `/report?story=${captionedStoryPk}`);
  const details = within(await screen.findByRole("dialog", { name: "Aperçu de l’image" }));
  const mentions = details.getAllByRole("link", {
    name: `@${mentionedAccount}`,
  });
  expect(mentions.length).toBeGreaterThan(0);
  for (const mention of mentions) {
    expect(mention).toHaveAttribute("href", `/users/${mentionedAccount}`);
  }
  expect(details.queryByRole("rowheader", { name: /^Story$/u })).not.toBeInTheDocument();
});
