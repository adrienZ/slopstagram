import { expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { Lightbox } from "../../server/components/lightbox.tsx";
import { StoryCard } from "../../server/components/story-card.tsx";
import { timelineProps } from "../page-props.ts";
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
    within(await screen.findByRole("dialog")).getByRole("link", { name: /user_019/u }),
  ).toHaveAttribute("href", "/users/user_019");
  linked.unmount();

  await renderPage(Gallery, {}, "/users/user_019?story=second");
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText(/user_019/u)).toBeVisible();
  expect(dialog.queryByRole("link", { name: /user_019/u })).not.toBeInTheDocument();
});

test("the preview is repeated as a blurred backdrop behind the image", async () => {
  await renderPage(Gallery, {}, "/report?story=second");
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByRole("img", { name: "Preview second" })).toHaveAttribute(
    "src",
    "/media/second.jpg",
  );
  expect(dialog.getByTestId("lightbox-backdrop")).toHaveAttribute("src", "/media/second.jpg");
  expect(dialog.getByTestId("lightbox-backdrop")).toHaveAttribute("aria-hidden", "true");
});
