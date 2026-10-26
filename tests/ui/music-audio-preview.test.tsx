import { expect, test, vi, type TestContext } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MusicAudioPreview } from "../../server/components/music-audio-preview.tsx";
import { MusicSticker } from "../../server/components/music-sticker.tsx";
import { Lightbox } from "../../server/components/lightbox.tsx";
import { timelineProps } from "../page-fixtures.ts";
import { renderContent, renderPage } from "./render.tsx";
import type { MusicPreview } from "../../server/music-preview.ts";

const preview: MusicPreview = {
  id: "first",
  description: "Audio de la story",
  sourceKind: "story_audio",
  audioUrl: `/media/music/${"a".repeat(64)}.m4a`,
};

function mockPlayback(context: TestContext) {
  const play = vi
    .spyOn(globalThis.HTMLMediaElement.prototype, "play")
    .mockImplementation(async function playAudio(this: HTMLMediaElement) {
      Object.defineProperty(this, "paused", { configurable: true, value: false });
      this.dispatchEvent(new globalThis.Event("play"));
    });
  const pause = vi
    .spyOn(globalThis.HTMLMediaElement.prototype, "pause")
    .mockImplementation(function pauseAudio(this: HTMLMediaElement) {
      Object.defineProperty(this, "paused", { configurable: true, value: true });
      this.dispatchEvent(new globalThis.Event("pause"));
    });
  context.onTestFinished(() => {
    play.mockRestore();
    pause.mockRestore();
  });
  return { play, pause };
}

test("the compact player loads only on request, plays, pauses, seeks and updates its time", async (context) => {
  const { play } = mockPlayback(context);
  const { user } = await renderContent(<MusicAudioPreview preview={preview} />);
  const audio = screen.getByLabelText("Écouter : Audio de la story");
  expect(audio).toHaveAttribute("preload", "none");
  expect(audio).not.toHaveAttribute("autoplay");
  expect(play).not.toHaveBeenCalled();
  const seek = screen.getByRole("slider", { name: "Avancer dans l’audio : Audio de la story" });
  expect(seek).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Lire : Audio de la story" }));
  expect(
    screen.getByRole("button", { name: "Mettre en pause : Audio de la story" }),
  ).toHaveAttribute("aria-pressed", "true");
  Object.defineProperty(audio, "duration", { configurable: true, value: 20 });
  fireEvent.loadedMetadata(audio);
  expect(seek).not.toBeDisabled();
  fireEvent.change(seek, { target: { value: "10" } });
  expect(audio).toHaveProperty("currentTime", 10);
  expect(screen.getByText("0:10")).toBeVisible();
  expect(screen.getByText("0:20")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Mettre en pause : Audio de la story" }));
  expect(screen.getByRole("button", { name: "Lire : Audio de la story" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  fireEvent.ended(audio);
  expect(screen.getByRole("button", { name: "Lire : Audio de la story" })).toBeVisible();
});

test("starting another preview pauses the currently playing preview", async (context) => {
  mockPlayback(context);
  const { user } = await renderContent(
    <>
      <MusicAudioPreview preview={{ ...preview, description: "First" }} />
      <MusicAudioPreview preview={{ ...preview, id: "second", description: "Second" }} />
    </>,
  );
  await user.click(screen.getByRole("button", { name: "Lire : First" }));
  await user.click(screen.getByRole("button", { name: "Lire : Second" }));
  expect(screen.getByRole("button", { name: "Lire : First" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Mettre en pause : Second" })).toBeVisible();
});

test("the music wrapper displays either the song badge or its player, and returns to the badge after a playback error", async () => {
  const { unmount } = await renderContent(<MusicSticker label="Song - Artist" />);
  expect(screen.getByText("Song - Artist")).toBeVisible();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  unmount();
  await renderContent(
    <MusicSticker label="Song - Artist" preview={{ ...preview, description: "Song — Artist" }} />,
  );
  expect(screen.queryByText("Song - Artist")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lire : Song — Artist" })).toBeVisible();
  fireEvent.error(screen.getByLabelText("Écouter : Song — Artist"));
  expect(screen.getByText("Song - Artist")).toBeVisible();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

test("detail-modal audio seeking keeps the selected story and navigation stops playback", async (context) => {
  const { pause } = mockPlayback(context);
  const stories = [
    {
      ...timelineProps.stories[0],
      stickerDetails: {
        text: "",
        music: [{ key: preview.id, label: preview.description, preview }],
      },
    },
    { ...timelineProps.stories[0], mediaPk: "next", stickerDetails: { text: "", music: [] } },
  ];
  function Details({ selectedStory }: { selectedStory?: string }) {
    return <Lightbox stories={stories} selectedStory={selectedStory} />;
  }
  const { user, router } = await renderPage(Details, {}, "/report?story=story-pk");
  const audio = screen.getByLabelText("Écouter : Audio de la story");
  Object.defineProperty(audio, "duration", { configurable: true, value: 20 });
  fireEvent.loadedMetadata(audio);
  await user.click(screen.getByRole("button", { name: "Lire : Audio de la story" }));
  const seek = screen.getByRole("slider");
  seek.focus();
  await user.keyboard("{ArrowRight}");
  expect(router.state.location.search.story).toBe("story-pk");
  fireEvent.change(seek, { target: { value: "8" } });
  expect(audio).toHaveProperty("currentTime", 8);
  await user.click(screen.getByRole("button", { name: "Image suivante" }));
  expect(router.state.location.search.story).toBe("next");
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(pause).toHaveBeenCalled();
});
