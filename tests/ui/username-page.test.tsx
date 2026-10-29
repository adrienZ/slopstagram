import { expect, test, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { Route } from "../../server/pages/users/$username.tsx";
import { namedAccount, timelineAccount } from "./page-data.ts";
import { timelineProps, timelineEntry } from "./page-props.ts";
import { createPageRenderer } from "../render-page.ts";

const renderer = createPageRenderer(Route, timelineProps, "/users/$username");

test("timeline shows the handle, the dated gallery and the active account", async () => {
  await renderer.mountRoute(`/users/${timelineAccount}`, timelineProps);
  expect(screen.getByRole("heading", { level: 1, name: namedAccount.fullName })).toBeVisible();
  expect(screen.getByRole("link", { name: `@${timelineAccount}` })).toBeVisible();
  expect(screen.getByRole("heading", { level: 2, name: "2026" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 3, name: "juillet" })).toBeVisible();
  const accounts = within(screen.getByRole("navigation", { name: "Utilisateurs" }));
  expect(
    accounts.getByRole("link", { name: new RegExp(`@${timelineAccount}`, "u") }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    accounts.getByRole("link", { name: new RegExp(`@${namedAccount.username}`, "u") }),
  ).toHaveAttribute("href", `/users/${namedAccount.username}`);
  const gallery = within(screen.getByRole("region", { name: "Galerie des stories" }));
  const days = timelineProps.timeline.years.flatMap(({ months }) =>
    months.flatMap((month) => month.days),
  );
  expect(days.map(({ key }) => key)).toEqual(["2026-07-26", "2026-07-25"]);
  for (const { key, stories } of days) {
    const day = gallery.getByRole("region", { name: key });
    expect(day).toHaveAttribute("id", `story-day-${key}`);
    const previews = within(day).getAllByRole("img");
    expect(previews).toHaveLength(stories.length);
    for (const preview of previews) {
      expect(preview).toHaveAttribute("loading", "lazy");
      expect(preview.getAttribute("src")).toMatch(/^\/media\/story-previews\//u);
    }
  }
});

test("a saved display name is shown above the separate handle", async () => {
  await renderer.mountRoute(`/users/${timelineAccount}`, {
    ...timelineProps,
    timeline: {
      ...timelineProps.timeline,
      timelineUser: {
        ...timelineProps.timeline.timelineUser,
        full_name: "Nom Affiché",
      },
    },
  });
  expect(screen.getByRole("heading", { level: 1, name: "Nom Affiché" })).toBeVisible();
  expect(screen.getByRole("link", { name: `@${timelineAccount}` })).toBeVisible();
});

test("timeline calendar scrolls to the selected day without changing the route", async () => {
  const scroll = vi.spyOn(globalThis.Element.prototype, "scrollIntoView");
  const { user, router } = await renderer.mountRoute(`/users/${timelineAccount}`, timelineProps);
  expect(screen.getByRole("button", { name: /lundi 27 juillet 2026/u })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: /dimanche 26 juillet 2026/u }));
  await waitFor(() => {
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
  expect(scroll.mock.instances[0]).toBe(screen.getByRole("region", { name: "2026-07-26" }));
  expect(router.state.location.href).toBe(`/users/${timelineAccount}`);
  const preference = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  vi.spyOn(preference, "matches", "get").mockReturnValue(true);
  act(() => {
    preference.dispatchEvent(new globalThis.Event("change"));
  });
  await user.click(screen.getByRole("button", { name: /Aujourd’hui/u }));
  await waitFor(() => {
    expect(scroll).toHaveBeenLastCalledWith({
      behavior: "instant",
      block: "start",
    });
  });
});

test("calendar navigates between months to another available day", async () => {
  const scroll = vi.spyOn(globalThis.Element.prototype, "scrollIntoView");
  const older = {
    ...timelineEntry,
    story: { ...timelineEntry.story, pk: "older" },
  };
  const { user } = await renderer.mountRoute(`/users/${timelineAccount}`, {
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
  });
  expect(screen.getByRole("button", { name: /mois précédent/iu })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.click(screen.getByRole("button", { name: /mois précédent/iu }));
  expect(screen.getByRole("button", { name: /mois précédent/iu })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.click(screen.getByRole("button", { name: /mois précédent/iu }));
  await user.click(screen.getByRole("button", { name: /jeudi 1 janvier 2026/u }));
  await waitFor(() => {
    expect(scroll).toHaveBeenCalled();
  });
  expect(scroll.mock.instances[0]).toBe(screen.getByRole("region", { name: "2026-01-01" }));
});

test("an empty account keeps navigation and every sticker kind without expansion controls", async () => {
  const { user } = await renderer.mountRoute(`/users/${timelineAccount}`, {
    ...timelineProps,
    stories: [],
    timeline: {
      ...timelineProps.timeline,
      stories: [],
      years: [],
      timelineUser: {
        ...timelineProps.timeline.timelineUser,
        full_name: null,
      },
    },
  });
  expect(screen.getByRole("heading", { name: `@${timelineAccount}`, level: 1 })).toBeVisible();
  expect(screen.getByText("Aucune story enregistrée pour cet utilisateur.")).toBeVisible();
  expect(
    screen
      .getAllByRole("region", { name: /^Type de sticker :/u })
      .map((card) => within(card).getByRole("heading").textContent),
  ).toEqual(timelineProps.stickerKinds);
  expect(screen.getAllByText("Aucun sticker")).toHaveLength(timelineProps.stickerKinds.length);
  expect(
    screen.queryByRole("button", {
      name: /Tout afficher|Afficher ou masquer :/u,
    }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /mois précédent/iu })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("button", { name: /mois suivant/iu })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const scroll = vi.spyOn(globalThis.Element.prototype, "scrollIntoView");
  await user.click(screen.getByRole("button", { name: /Aujourd’hui/u }));
  expect(scroll).not.toHaveBeenCalled();
});

test("a timeline story deep link opens the preview, steps to the next story and Escape closes it", async () => {
  const { user, router } = await renderer.mountRoute(
    `/users/user_075?story=${timelineProps.stories[0].mediaPk}`,
    timelineProps,
  );
  const dialog = within(await screen.findByRole("dialog", { name: "Aperçu de l’image" }));
  expect(dialog.getByText(`1 / ${timelineProps.stories.length}`)).toBeVisible();
  await user.click(dialog.getByRole("button", { name: "Image suivante" }));
  expect(dialog.getByText(`2 / ${timelineProps.stories.length}`)).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(router.state.location.search).toEqual({});
});

test("mobile calendar opens in a sheet and closes after choosing a day", async () => {
  vi.stubGlobal("innerWidth", 390);
  const scroll = vi.spyOn(globalThis.Element.prototype, "scrollIntoView");
  const { user } = await renderer.mountRoute(`/users/${timelineAccount}`, timelineProps);
  expect(screen.queryByRole("navigation", { name: "Utilisateurs" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Afficher ou masquer le calendrier" }));
  const sidebar = await screen.findByRole("dialog");
  expect(within(sidebar).getByRole("button", { name: /dimanche 26 juillet 2026/u })).toBeEnabled();
  await user.click(within(sidebar).getByRole("button", { name: /dimanche 26 juillet 2026/u }));
  await waitFor(() => {
    expect(scroll).toHaveBeenCalled();
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("the profile header handle opens the Instagram profile in a new tab", async () => {
  await renderer.mountRoute(`/users/${timelineAccount}`, timelineProps);
  const link = screen.getByRole("link", { name: `@${timelineAccount}` });
  expect(link).toHaveAttribute("href", `https://www.instagram.com/${timelineAccount}/`);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
});
