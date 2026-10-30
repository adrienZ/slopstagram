import { expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { UserTimelinePage } from "../../server/pages/users/$username.tsx";
import type { TimelineContentProps } from "../../server/pages/users/$username.tsx";
import { stickerKindsOf, timelineEntry, timelineProps } from "./page-props.ts";
import { renderPage } from "./render.tsx";

/** Renders the page with the sticker kinds its stories really have, as the loader would report them. */
async function renderTimeline(props: TimelineContentProps) {
  return await renderPage(
    UserTimelinePage,
    { ...props, stickerKinds: stickerKindsOf(props.timeline.stories) },
    "/users/user_075",
  );
}

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
              {
                kind: "mention",
                label: index === 0 ? "@USER_021" : `@person-${index}`,
              },
              {
                kind: "link",
                label: `https://example.com/story/${index}?tracking=1`,
              },
            ],
          },
        },
      })),
    },
  };
}

test("pagination shows three story groups, keeps occurrences together, and has correct boundaries", async () => {
  const { user } = await renderTimeline(stickerTimeline());
  const card = within(screen.getByRole("region", { name: "Type de sticker : mention" }));
  expect(card.getByText("16 stickers · 8 stories")).toBeVisible();
  expect(within(card.getByRole("table")).getAllByRole("row")).toHaveLength(4);
  expect(card.getByText("@person-0")).toBeVisible();
  expect(card.getAllByText("@person-2")).toHaveLength(2);
  expect(card.queryByText("@person-3")).not.toBeInTheDocument();
  const previous = card.getByRole("button", {
    name: "Page précédente : mention",
  });
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

test("sticker cards stay expanded and have no collapse control", async () => {
  const { user } = await renderTimeline(stickerTimeline());
  const card = within(screen.getByRole("region", { name: "Type de sticker : mention" }));
  await user.click(card.getByRole("button", { name: "Page suivante : mention" }));
  expect(card.getByText("2 / 3")).toBeVisible();
  expect(card.getByRole("table")).toBeVisible();
  expect(
    card.queryByRole("button", { name: "Afficher ou masquer : mention" }),
  ).not.toBeInTheDocument();
});

test("full history opens all results and a nested preview returns to the kind modal", async () => {
  const { user } = await renderTimeline(stickerTimeline());
  await user.click(screen.getByRole("button", { name: "Tout afficher : mention" }));
  const modal = await screen.findByRole("dialog", {
    name: "Stickers · mention",
  });
  expect(within(modal).getByText("16 stickers dans 8 stories · historique complet")).toBeVisible();
  expect(within(modal).getAllByRole("row")).toHaveLength(9);
  expect(within(modal).getAllByText("@person-7")).toHaveLength(2);
  await user.click(within(modal).getByRole("button", { name: "Ouvrir aperçu sticker-7" }));
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
  const details = within(screen.getByRole("dialog", { name: "Aperçu de l’image" }));
  expect(details.getAllByText("@person-7")).toHaveLength(2);
  expect(
    details.getAllByText("@person-7").every((label) => label.closest("[data-slot=badge]")),
  ).toBe(true);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Stickers · mention" })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Aperçu de l’image" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tout afficher : mention" })).toHaveFocus();
});

test("only saved mentions link to their canonical profile and unknown mentions remain text", async () => {
  await renderTimeline(stickerTimeline(1));
  const table = within(screen.getByRole("table", { name: "Stickers : mention" }));
  expect(table.getByRole("link", { name: "@USER_021" })).toHaveAttribute("href", "/users/user_021");
  expect(table.getByText("@person-0").closest("a")).toBeNull();
  expect(
    screen.queryByRole("navigation", { name: "Pagination : mention" }),
  ).not.toBeInTheDocument();
});

test("link badges are condensed in cards and show full URLs in the history modal", async () => {
  const { user } = await renderTimeline(stickerTimeline(1));
  const table = within(screen.getByRole("table", { name: "Stickers : link" }));
  expect(table.getByText("example.com/story/0").closest("[data-slot=badge]")).toHaveAttribute(
    "title",
    "https://example.com/story/0?tracking=1",
  );
  await user.click(screen.getByRole("button", { name: "Tout afficher : link" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · link" }));
  expect(modal.getByText("https://example.com/story/0?tracking=1")).toBeVisible();
  expect(modal.getByText("sticker-0")).toBeVisible();
});

test("missing previews keep their sticker rows and full history available", async () => {
  await renderTimeline({ ...stickerTimeline(1), stories: [] });
  expect(screen.getAllByText("Preview unavailable")).toHaveLength(2);
  expect(screen.getByRole("table", { name: "Stickers : mention" })).toHaveTextContent("@person-0");
  expect(screen.getByRole("button", { name: "Tout afficher : mention" })).toBeEnabled();
});

test("music shows its cached cover in the card, expanded modal and story details, preserving labels and counts", async () => {
  const props = stickerTimeline(1);
  props.timeline.stories[0].story.annotations = {
    locations: [],
    storyAudio: {
      mediaPk: "sticker-0",
      sourceUrl: "https://example.com/story-audio",
      mimeType: "audio/mp4",
      codecs: "mp4a.40.5",
      durationMs: null,
      cachePath: `audio/${"f".repeat(64)}.m4a`,
      state: "available",
    },
    stickers: [
      { kind: "music", label: "Exact, original label", occurrenceId: "linked" },
      { kind: "music", label: "Exact, original label", occurrenceId: "other" },
    ],
    musicObservations: [
      {
        id: "observation",
        source: "story_music_stickers",
        providerOccurrenceId: "provider",
        occurrenceId: "linked",
        metadata: {
          status: "usable",
          id: "metadata",
          instagramAudioAssetId: "audio",
          title: "Song",
          artist: "Artist",
          durationMs: null,
          audioDurationMs: null,
          audioSourceUrl: "https://example.com/private-source",
          artworkSourceUrl: null,
          audioCachePath: `audio/${"a".repeat(64)}.m4a`,
          artworkCachePath: `music/${"b".repeat(64)}.jpg`,
          audioState: "available",
          artworkState: "available",
        },
      },
    ],
  };
  const { user } = await renderTimeline(props);
  const card = within(screen.getByRole("region", { name: "Type de sticker : music" }));
  expect(card.getByText("2 stickers · 1 stories")).toBeVisible();
  expect(card.getAllByText("Exact, original label")).toHaveLength(1);
  expect(card.getByRole("img", { name: "Pochette de Song — Artist" })).toHaveAttribute(
    "src",
    `/media/music/${"b".repeat(64)}.jpg`,
  );
  const audio = card.getByLabelText("Écouter : Song — Artist");
  expect(audio).toHaveAttribute("src", `/media/audio/${"f".repeat(64)}.m4a`);
  expect(card.getByRole("button", { name: "Lire : Song — Artist" })).toBeVisible();
  expect(audio).not.toHaveAttribute("controls");
  expect(audio).toHaveAttribute("preload", "metadata");
  expect(audio).not.toHaveAttribute("autoplay");
  expect(card.getAllByLabelText("Écouter : Song — Artist")).toHaveLength(1);
  expect(card.queryByLabelText("Écouter : Audio de la story")).not.toBeInTheDocument();
  await user.click(card.getByRole("button", { name: "Tout afficher : music" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · music" }));
  expect(modal.getByRole("button", { name: "Lire : Song — Artist" })).toBeVisible();
  expect(modal.getAllByText("Exact, original label")).toHaveLength(1);
  expect(modal.getByRole("img", { name: "Pochette de Song — Artist" })).toHaveAttribute(
    "src",
    `/media/music/${"b".repeat(64)}.jpg`,
  );
  await user.click(modal.getByRole("button", { name: "Ouvrir aperçu sticker-0" }));
  const details = within(await screen.findByRole("dialog", { name: "Aperçu de l’image" }));
  expect(details.getByRole("img", { name: "Pochette de Song — Artist" })).toHaveAttribute(
    "src",
    `/media/music/${"b".repeat(64)}.jpg`,
  );
});

test("music without audio stays hidden and another asset does not borrow its cover", async () => {
  const props = stickerTimeline(1);
  const metadata = {
    status: "partial" as const,
    id: "partial",
    instagramAudioAssetId: null,
    title: "Cover only",
    artist: null,
    durationMs: null,
    audioDurationMs: null,
    audioSourceUrl: null,
    artworkSourceUrl: "https://example.com/signed-source",
    audioCachePath: null,
    artworkCachePath: `music/${"c".repeat(64)}.jpg`,
    audioState: "unavailable" as const,
    artworkState: "available" as const,
  };
  props.timeline.stories[0].story.annotations = {
    locations: [],
    stickers: [{ kind: "music", label: "Legacy label" }],
    musicObservations: [
      {
        id: "cover",
        source: "story_music_stickers",
        providerOccurrenceId: null,
        occurrenceId: null,
        metadata,
      },
      {
        id: "audio",
        source: "story_music_stickers",
        providerOccurrenceId: null,
        occurrenceId: null,
        metadata: {
          ...metadata,
          id: "another",
          title: "Audio only",
          artworkCachePath: null,
          artworkState: "unavailable",
          audioCachePath: `audio/${"d".repeat(64)}.wav`,
          audioState: "available",
        },
      },
    ],
  };
  const { user } = await renderTimeline(props);
  const card = within(screen.getByRole("region", { name: "Type de sticker : music" }));
  expect(card.getByText("1 stickers · 1 stories")).toBeVisible();
  expect(card.queryByText("Cover only")).not.toBeInTheDocument();
  expect(card.queryByRole("img", { name: /Pochette/u })).not.toBeInTheDocument();
  expect(card.getByRole("button", { name: "Lire : Audio only" })).toBeVisible();
  expect(card.getByLabelText("Écouter : Audio only")).toHaveAttribute("preload", "metadata");
  expect(card.queryByRole("link", { name: /Spotify/u })).not.toBeInTheDocument();
  fireEvent.error(card.getByLabelText("Écouter : Audio only"));
  expect(card.queryByText("Cover only")).not.toBeInTheDocument();
  expect(card.getByText("Audio only")).toBeVisible();
  expect(card.queryByText(/indisponible/u)).not.toBeInTheDocument();
  expect(card.getByText("Legacy label")).toBeVisible();
  await user.click(card.getByRole("button", { name: "Tout afficher : music" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · music" }));
  expect(modal.getAllByText("Legacy label")).toHaveLength(1);
  expect(modal.queryByRole("img", { name: /Pochette/u })).not.toBeInTheDocument();
  expect(modal.getByRole("button", { name: "Lire : Audio only" })).toBeVisible();
});

test("music observations with media but without labels stay visible without increasing sticker-story counts", async () => {
  const props = stickerTimeline(1);
  props.timeline.stories[0].story.annotations = {
    locations: [],
    stickers: [{ kind: "music", label: "Original label" }],
  };
  props.timeline.stories.push({
    ...timelineEntry,
    story: {
      pk: "without-label",
      annotations: {
        locations: [],
        stickers: [],
        musicObservations: [
          {
            id: "observation-only",
            source: "story_music_stickers",
            occurrenceId: null,
            providerOccurrenceId: null,
            metadata: {
              status: "partial",
              id: "partial-only",
              instagramAudioAssetId: "audio-only",
              title: null,
              artist: null,
              durationMs: null,
              audioDurationMs: null,
              audioSourceUrl: null,
              artworkSourceUrl: null,
              audioCachePath: `audio/${"e".repeat(64)}.wav`,
              artworkCachePath: null,
              audioState: "available",
              artworkState: "unavailable",
            },
          },
        ],
      },
    },
  });
  const { user } = await renderTimeline(props);
  const card = within(screen.getByRole("region", { name: "Type de sticker : music" }));
  expect(card.getByText("1 stickers · 1 stories")).toBeVisible();
  expect(card.getByRole("button", { name: "Lire : Musique reçue" })).toBeVisible();
  await user.click(card.getByRole("button", { name: "Tout afficher : music" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · music" }));
  expect(modal.getByText("1 stickers dans 1 stories · historique complet")).toBeVisible();
  expect(modal.getAllByRole("row")).toHaveLength(3);
  expect(modal.getByRole("button", { name: "Lire : Musique reçue" })).toBeVisible();
});

test("sticker dates show days without times and unavailable music stays silent in both views", async () => {
  const props = stickerTimeline(1);
  props.timeline.stories[0].story.annotations = {
    locations: [],
    stickers: [{ kind: "music", label: "Visions - Tample" }],
    musicObservations: [
      {
        id: "unlinked",
        source: "story_music_stickers",
        occurrenceId: null,
        providerOccurrenceId: null,
        metadata: {
          status: "usable",
          id: "music",
          instagramAudioAssetId: "audio",
          title: "Visions",
          artist: "Tample",
          durationMs: null,
          audioDurationMs: null,
          audioSourceUrl: "https://example.com/expired",
          artworkSourceUrl: null,
          audioCachePath: null,
          artworkCachePath: null,
          audioState: "failed",
          artworkState: "unavailable",
        },
      },
    ],
  };
  const { user } = await renderTimeline(props);
  const card = within(screen.getByRole("region", { name: "Type de sticker : music" }));
  expect(card.getByText("26 juil.")).toBeVisible();
  expect(card.queryByText(/indisponible/u)).not.toBeInTheDocument();
  expect(card.queryByLabelText("Musique reçue dans cette story")).not.toBeInTheDocument();
  expect(card.getAllByText("Visions - Tample")).toHaveLength(1);
  expect(card.queryByText("Visions — Tample")).not.toBeInTheDocument();
  await user.click(card.getByRole("button", { name: "Tout afficher : music" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · music" }));
  expect(modal.getByText("26 juil.")).toBeVisible();
  expect(modal.queryByText(/indisponible/u)).not.toBeInTheDocument();
  expect(modal.getAllByText("Visions - Tample")).toHaveLength(1);
  expect(modal.queryByText("Visions — Tample")).not.toBeInTheDocument();
});

test("a DASH soundtrack has one explicitly labeled player per story in the card and modal", async () => {
  const props = stickerTimeline(1);
  props.timeline.stories[0].story.annotations = {
    locations: [],
    stickers: [
      { kind: "music", label: "Exact original label" },
      { kind: "music", label: "Exact original label" },
    ],
    storyAudio: {
      mediaPk: "sticker-0",
      sourceUrl: "https://example.com/private-story-audio",
      mimeType: "audio/mp4",
      codecs: "mp4a.40.5",
      durationMs: null,
      cachePath: `audio/${"f".repeat(64)}.m4a`,
      state: "available",
    },
  };
  const { user } = await renderTimeline(props);
  const card = within(screen.getByRole("region", { name: "Type de sticker : music" }));
  expect(card.getAllByText("Exact original label")).toHaveLength(2);
  expect(card.getByText("2 stickers · 1 stories")).toBeVisible();
  expect(card.getAllByLabelText("Écouter : Exact original label")).toHaveLength(1);
  const audio = card.getByLabelText("Écouter : Exact original label");
  expect(audio).toHaveAttribute("src", `/media/audio/${"f".repeat(64)}.m4a`);
  expect(audio).toHaveAttribute("preload", "metadata");
  expect(audio).not.toHaveAttribute("autoplay");
  expect(card.queryByRole("img", { name: /Pochette/u })).not.toBeInTheDocument();
  fireEvent.error(audio);
  expect(card.getAllByText("Exact original label")).toHaveLength(2);
  await user.click(card.getByRole("button", { name: "Tout afficher : music" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · music" }));
  expect(modal.getAllByLabelText("Écouter : Exact original label")).toHaveLength(1);
  expect(modal.getByRole("button", { name: "Lire : Exact original label" })).toBeVisible();
  await user.click(modal.getByRole("button", { name: "Ouvrir aperçu sticker-0" }));
  const details = within(await screen.findByRole("dialog", { name: "Aperçu de l’image" }));
  expect(details.getByRole("button", { name: "Lire : Exact original label" })).toBeVisible();
  expect(details.getAllByRole("slider")).toHaveLength(1);
  expect(details.getAllByLabelText("Écouter : Exact original label")).toHaveLength(1);
});
