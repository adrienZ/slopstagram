import { expect, test, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { UserTimelinePage } from "../../server/pages/users/$username.tsx";
import { timelineProps, timelineEntry } from "../page-fixtures.ts";
import { renderPage } from "./render.tsx";
import { matchMedia } from "./browser.ts";

test("timeline shows separate display name and handle, dated gallery and active account", async () => {
  await renderPage(UserTimelinePage, timelineProps, "/users/timeline-user");
  expect(screen.getByRole("heading", { level: 1, name: "Timeline User" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 2, name: "2026" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 3, name: "janvier" })).toBeVisible();
  const accounts = within(screen.getByRole("navigation", { name: "Utilisateurs" }));
  expect(accounts.getByRole("link", { name: /@timeline-user/u })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(accounts.getByRole("link", { name: /@other-user/u })).toHaveAttribute(
    "href",
    "/users/other-user",
  );
  const gallery = within(screen.getByRole("region", { name: "Galerie des stories" }));
  const day = gallery.getByRole("region", { name: "2026-01-01" });
  expect(day).toHaveAttribute("id", "story-day-2026-01-01");
  expect(within(day).getByRole("img")).toHaveAttribute("src", "/media/story-previews/story-pk.jpg");
  expect(within(day).getByRole("img")).toHaveAttribute("loading", "lazy");
});

test("timeline calendar scrolls to the selected day without changing the route", async () => {
  const scroll = vi.spyOn(globalThis.Element.prototype, "scrollIntoView");
  const { user, router } = await renderPage(
    UserTimelinePage,
    timelineProps,
    "/users/timeline-user",
  );
  expect(screen.getByRole("button", { name: /vendredi 2 janvier 2026/u })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: /jeudi 1 janvier 2026/u }));
  await waitFor(() => {
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
  expect(scroll.mock.instances[0]).toBe(screen.getByRole("region", { name: "2026-01-01" }));
  expect(router.state.location.href).toBe("/users/timeline-user");
  matchMedia("(prefers-reduced-motion: reduce)").setMatches(true);
  await user.click(screen.getByRole("button", { name: /Aujourd’hui/u }));
  await waitFor(() => {
    expect(scroll).toHaveBeenLastCalledWith({ behavior: "instant", block: "start" });
  });
});

test("calendar navigates between months to another available day", async () => {
  const scroll = vi.spyOn(globalThis.Element.prototype, "scrollIntoView");
  const older = { ...timelineEntry, story: { ...timelineEntry.story, pk: "older" } };
  const { user } = await renderPage(
    UserTimelinePage,
    {
      ...timelineProps,
      timeline: {
        ...timelineProps.timeline,
        years: [
          {
            label: "2026",
            months: [
              {
                key: "2026-02",
                label: "février",
                days: [{ key: "2026-02-02", label: "02", stories: [timelineEntry] }],
              },
              {
                key: "2026-01",
                label: "janvier",
                days: [{ key: "2026-01-01", label: "01", stories: [older] }],
              },
            ],
          },
        ],
      },
    },
    "/users/timeline-user",
  );
  await user.click(screen.getByRole("button", { name: /mois précédent/iu }));
  await user.click(screen.getByRole("button", { name: /jeudi 1 janvier 2026/u }));
  await waitFor(() => {
    expect(scroll).toHaveBeenCalled();
  });
  expect(scroll.mock.instances[0]).toBe(screen.getByRole("region", { name: "2026-01-01" }));
});

test("an empty account keeps navigation and every sticker kind without expansion controls", async () => {
  const { user } = await renderPage(
    UserTimelinePage,
    {
      ...timelineProps,
      stories: [],
      timeline: {
        ...timelineProps.timeline,
        avatarPath: null,
        stories: [],
        years: [],
        timelineUser: { ...timelineProps.timeline.timelineUser, full_name: null },
      },
    },
    "/users/timeline-user",
  );
  expect(screen.getByRole("heading", { name: "@timeline-user", level: 1 })).toBeVisible();
  expect(screen.getByText("Aucune story enregistrée pour cet utilisateur.")).toBeVisible();
  expect(
    screen
      .getAllByRole("region", { name: /^Type de sticker :/u })
      .map((card) => within(card).getByRole("heading").textContent),
  ).toEqual(["location", "mention", "link", "music", "hashtag"]);
  expect(screen.getAllByText("Aucun sticker")).toHaveLength(5);
  expect(
    screen.queryByRole("button", { name: /Tout afficher|Afficher ou masquer :/u }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  const scroll = vi.spyOn(globalThis.Element.prototype, "scrollIntoView");
  await user.click(screen.getByRole("button", { name: /Aujourd’hui/u }));
  expect(scroll).not.toHaveBeenCalled();
});

test("a timeline story deep link opens the real preview and Escape closes it", async () => {
  const { user, router } = await renderPage(
    UserTimelinePage,
    timelineProps,
    "/users/timeline-user?story=story-pk",
  );
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Image suivante" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(router.state.location.search).toEqual({});
});

test("mobile calendar opens in a sheet and closes after choosing a day", async () => {
  vi.stubGlobal("innerWidth", 390);
  const scroll = vi.spyOn(globalThis.Element.prototype, "scrollIntoView");
  const { user } = await renderPage(UserTimelinePage, timelineProps, "/users/timeline-user");
  expect(screen.queryByRole("navigation", { name: "Utilisateurs" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Afficher ou masquer le calendrier" }));
  const sidebar = await screen.findByRole("dialog");
  expect(within(sidebar).getByRole("button", { name: /jeudi 1 janvier 2026/u })).toBeEnabled();
  await user.click(within(sidebar).getByRole("button", { name: /jeudi 1 janvier 2026/u }));
  await waitFor(() => {
    expect(scroll).toHaveBeenCalled();
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
