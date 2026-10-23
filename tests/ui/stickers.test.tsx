import { expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { UserTimelinePage } from "../../server/pages/users/$username.tsx";
import type { TimelineContentProps } from "../../server/pages/users/$username.tsx";
import { timelineEntry, timelineProps } from "../page-fixtures.ts";
import { renderPage } from "./render.tsx";

function stickerTimeline(count = 8): TimelineContentProps {
  return {
    ...timelineProps,
    stories: Array.from({ length: count }, (_, index) => ({
      ...timelineProps.stories[0],
      mediaPk: `sticker-${index}`,
      position: index + 1,
      count,
      preview: `/media/sticker-${index}.jpg`,
    })),
    timeline: {
      ...timelineProps.timeline,
      stories: Array.from({ length: count }, (_, index) => ({
        ...timelineEntry,
        taken_at: timelineEntry.taken_at - index * 60,
        story: {
          ...timelineEntry.story,
          pk: `sticker-${index}`,
          annotations: {
            locations: [],
            stickers: [
              { kind: "mention", label: `@person-${index}` },
              { kind: "mention", label: index === 0 ? "@OTHER-user" : `@person-${index}` },
              { kind: "link", label: `https://example.com/story/${index}?tracking=1` },
            ],
          },
        },
      })),
    },
  };
}

test("pagination shows three story groups, keeps occurrences together, and has correct boundaries", async () => {
  const { user } = await renderPage(UserTimelinePage, stickerTimeline(), "/users/timeline-user");
  const card = within(screen.getByRole("region", { name: "Type de sticker : mention" }));
  expect(card.getByText("16 stickers · 8 stories")).toBeVisible();
  expect(within(card.getByRole("table")).getAllByRole("row")).toHaveLength(4);
  expect(card.getByText("@person-0")).toBeVisible();
  expect(card.getAllByText("@person-2")).toHaveLength(2);
  expect(card.queryByText("@person-3")).not.toBeInTheDocument();
  const previous = card.getByRole("button", { name: "Page précédente : mention" });
  const next = card.getByRole("button", { name: "Page suivante : mention" });
  expect(previous).toBeDisabled();
  await user.click(next);
  expect(card.getByText("2 / 3")).toBeVisible();
  expect(card.queryByText("@person-0")).not.toBeInTheDocument();
  expect(card.getAllByText("@person-3")).toHaveLength(2);
  await user.click(next);
  expect(within(card.getByRole("table")).getAllByRole("row")).toHaveLength(3);
  expect(next).toBeDisabled();
  expect(card.getByText("3 / 3")).toBeVisible();
  await user.click(previous);
  expect(card.getByText("2 / 3")).toBeVisible();
  // Each kind maintains its own page.
  const links = within(screen.getByRole("region", { name: "Type de sticker : link" }));
  expect(links.getByText("1 / 3")).toBeVisible();
});

test("a populated kind collapses and reopens without losing its current page", async () => {
  const { user } = await renderPage(UserTimelinePage, stickerTimeline(), "/users/timeline-user");
  const card = within(screen.getByRole("region", { name: "Type de sticker : mention" }));
  await user.click(card.getByRole("button", { name: "Page suivante : mention" }));
  const toggle = card.getByRole("button", { name: "Afficher ou masquer : mention" });
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(card.queryByRole("table")).not.toBeInTheDocument();
  await user.click(toggle);
  expect(card.getByText("2 / 3")).toBeVisible();
});

test("full history opens all results and a nested preview returns to the kind modal", async () => {
  const { user } = await renderPage(UserTimelinePage, stickerTimeline(), "/users/timeline-user");
  await user.click(screen.getByRole("button", { name: "Tout afficher : mention" }));
  const modal = await screen.findByRole("dialog", { name: "Stickers · mention" });
  expect(within(modal).getByText("16 stickers dans 8 stories · historique complet")).toBeVisible();
  expect(within(modal).getAllByRole("row")).toHaveLength(9);
  expect(within(modal).getAllByText("@person-7")).toHaveLength(2);
  await user.click(within(modal).getByRole("button", { name: "Ouvrir aperçu sticker-7" }));
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Stickers · mention" })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Aperçu de l’image" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tout afficher : mention" })).toHaveFocus();
});

test("only saved mentions link to their canonical profile and unknown mentions remain text", async () => {
  await renderPage(UserTimelinePage, stickerTimeline(1), "/users/timeline-user");
  const table = within(screen.getByRole("table", { name: "Stickers : mention" }));
  expect(table.getByRole("link", { name: "@OTHER-user" })).toHaveAttribute(
    "href",
    "/users/other-user",
  );
  expect(table.getByText("@person-0").closest("a")).toBeNull();
  expect(
    screen.queryByRole("navigation", { name: "Pagination : mention" }),
  ).not.toBeInTheDocument();
});

test("link badges are condensed in cards and show full URLs in the history modal", async () => {
  const { user } = await renderPage(UserTimelinePage, stickerTimeline(1), "/users/timeline-user");
  const table = within(screen.getByRole("table", { name: "Stickers : link" }));
  expect(table.getByText("example.com/story/0")).toHaveAttribute(
    "title",
    "https://example.com/story/0?tracking=1",
  );
  await user.click(screen.getByRole("button", { name: "Tout afficher : link" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · link" }));
  expect(modal.getByText("https://example.com/story/0?tracking=1")).toBeVisible();
  expect(modal.getByText("sticker-0")).toBeVisible();
});

test("missing previews keep their sticker rows and full history available", async () => {
  await renderPage(
    UserTimelinePage,
    { ...stickerTimeline(1), stories: [] },
    "/users/timeline-user",
  );
  expect(screen.getAllByText("Preview unavailable")).toHaveLength(2);
  expect(screen.getByRole("table", { name: "Stickers : mention" })).toHaveTextContent("@person-0");
  expect(screen.getByRole("button", { name: "Tout afficher : mention" })).toBeEnabled();
});
