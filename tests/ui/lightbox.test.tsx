import { expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { Lightbox } from "../../server/components/lightbox.tsx";
import { StoryCard } from "../../server/components/story-card.tsx";
import { timelineProps } from "../page-fixtures.ts";
import { renderPage } from "./render.tsx";

const stories = ["12345678901234567890", "second", "third"].map((mediaPk, index) => ({
  ...timelineProps.stories[0],
  mediaPk,
  position: index + 1,
  count: 3,
  preview: `/media/${mediaPk}.jpg`,
  alt: `Preview ${mediaPk}`,
  avatar: undefined,
}));

function Gallery({ selectedStory }: { selectedStory?: string }) {
  return (
    <>
      {stories.map((story) => (
        <StoryCard key={story.mediaPk} story={story} />
      ))}
      <Lightbox stories={stories} selectedStory={selectedStory} />
    </>
  );
}

function LinkedGallery({ selectedStory }: { selectedStory?: string }) {
  return <Lightbox stories={stories} selectedStory={selectedStory} linkToProfile />;
}

test("buttons and arrow keys wrap through the gallery while preserving other search parameters", async () => {
  const { user, router } = await renderPage(
    Gallery,
    {},
    "/report?date=2026-07-25&story=12345678901234567890",
  );
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText("1 / 3")).toBeVisible();
  await user.click(dialog.getByRole("button", { name: "Image précédente" }));
  expect(dialog.getByText("3 / 3")).toBeVisible();
  expect(router.state.location.search).toEqual({ date: "2026-07-25", story: "third" });
  await user.click(dialog.getByRole("button", { name: "Image suivante" }));
  expect(dialog.getByText("1 / 3")).toBeVisible();
  await user.keyboard("{ArrowRight}");
  expect(dialog.getByText("2 / 3")).toBeVisible();
  await user.keyboard("{ArrowLeft}");
  expect(dialog.getByText("1 / 3")).toBeVisible();
  expect(router.state.location.search.story).toBe("12345678901234567890");
  await user.keyboard("{Escape}");
  expect(router.state.location.search).toEqual({ date: "2026-07-25" });
  expect(screen.getByRole("button", { name: "Ouvrir aperçu 12345678901234567890" })).toHaveFocus();
});

test("the header username links to the profile only when asked to", async () => {
  const linked = await renderPage(LinkedGallery, {}, "/report?story=second");
  expect(
    within(await screen.findByRole("dialog")).getByRole("link", { name: /Timeline User/u }),
  ).toHaveAttribute("href", "/users/timeline-user");
  linked.unmount();

  await renderPage(Gallery, {}, "/users/timeline-user?story=second");
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText(/Timeline User/u)).toBeVisible();
  expect(dialog.queryByRole("link", { name: /Timeline User/u })).not.toBeInTheDocument();
});
