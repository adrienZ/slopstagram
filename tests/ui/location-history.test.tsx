import { expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { UserTimelinePage } from "../../server/pages/users/$username.tsx";
import type { TimelineContentProps } from "../../server/pages/users/$username.tsx";
import type { StoryLocationObservation } from "../../sdk/entities/location-metadata.ts";
import { stickerKindsOf, timelineEntry, timelineProps } from "./page-props.ts";
import { renderPage } from "./render.tsx";
import { LocationMapContext } from "../../server/components/location-history.tsx";
import type { LocationMapCanvasProps } from "../../server/components/location-map-canvas.tsx";

// Only the WebGL/tile boundary is replaced; the page and grouping run unchanged.
function TestMapCanvas({ places, onSelect, children }: LocationMapCanvasProps) {
  return (
    <div role="region" aria-label="Carte des lieux">
      {places.map((place) => (
        <button
          key={place.id}
          type="button"
          onClick={() => {
            onSelect(place.id);
          }}
          data-latitude={place.latitude}
          data-longitude={place.longitude}
        >
          {place.name}
        </button>
      ))}
      {children}
    </div>
  );
}

function TestTimelinePage(props: TimelineContentProps & { selectedStory?: string }) {
  return (
    <LocationMapContext value={TestMapCanvas}>
      <UserTimelinePage
        {...props}
        stickerKinds={[
          ...new Set([...props.stickerKinds, ...stickerKindsOf(props.timeline.stories)]),
        ].toSorted()}
      />
    </LocationMapContext>
  );
}

function observation(
  id: string,
  placeId: string,
  latitude: number | null = 48,
  category: string | null = null,
): StoryLocationObservation {
  return {
    id,
    source: "story_locations",
    providerOccurrenceId: null,
    occurrenceId: `sticker-${id}`,
    metadata:
      latitude === null
        ? {
            status: "partial",
            id: placeId,
            instagramPlaceId: placeId,
            name: "Sans coordonnées",
            address: null,
            latitude: null,
            longitude: null,
            facebookPlacesId: null,
            externalSource: null,
            category,
            city: null,
            zip: null,
            lastLookupAttemptAt: null,
            lastLookupFailure: null,
          }
        : {
            status: "usable",
            id: placeId,
            instagramPlaceId: placeId,
            name: "Même nom",
            address: null,
            latitude,
            longitude: 2,
            facebookPlacesId: null,
            externalSource: null,
            category,
            city: null,
            zip: null,
            lastLookupAttemptAt: null,
            lastLookupFailure: null,
          },
  };
}

function locationTimeline(
  observations: Array<Array<StoryLocationObservation>>,
): TimelineContentProps {
  return {
    ...timelineProps,
    stories: observations.map((_, index) => ({
      ...timelineProps.stories[0],
      mediaPk: `location-${index}`,
      preview: `/media/location-${index}.jpg`,
    })),
    timeline: {
      ...timelineProps.timeline,
      stories: observations.map((locations, index) => ({
        ...timelineEntry,
        taken_at: timelineEntry.taken_at - index * 86_400 * 365,
        story: {
          ...timelineEntry.story,
          pk: `location-${index}`,
          annotations: {
            locations: [],
            stickers: [
              {
                kind: "location",
                label: "Paris, Paris",
                occurrenceId: locations[0]?.occurrenceId ?? `legacy-${index}`,
              },
              { kind: "music", label: "Song" },
            ],
            locationObservations: locations,
          },
        },
      })),
    },
  };
}

test("location dialog maps the whole history by provider identity and preserves the complete table", async () => {
  const props = locationTimeline([
    [observation("a", "place-a")],
    [observation("b", "place-a")],
    [observation("c", "place-b", 0)],
    [observation("d", "partial", null)],
    [],
  ]);
  const { user } = await renderPage(TestTimelinePage, props, "/users/user_075");
  expect(screen.queryByRole("region", { name: "Carte des lieux" })).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Type de sticker : location" })).getByText(
      "5 stickers · 5 stories",
    ),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Tout afficher : location" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · location" }));
  const map = within(await modal.findByRole("region", { name: "Carte des lieux" }));
  expect(map.getAllByRole("button", { name: "Même nom" })).toHaveLength(2);
  expect(map.getAllByRole("button")[1]).toHaveAttribute("data-latitude", "0");
  expect(modal.getByText("2 lieux sur la carte")).toBeVisible();
  expect(modal.getByText("2 stickers sans position confirmée")).toBeVisible();
  expect(modal.getByText("1 localisation sans coordonnées")).toBeVisible();
  const table = within(modal.getByRole("table", { name: "Stickers : location" }));
  expect(table.getAllByText("Paris, Paris")).toHaveLength(5);
  expect(table.getAllByRole("row")).toHaveLength(6);
  expect(modal.getByText("5 stickers dans 5 stories · historique complet")).toBeVisible();
  await user.click(map.getAllByRole("button", { name: "Même nom" })[0]);
  const selected = within(map.getByRole("region", { name: "Stories du lieu : Même nom" }));
  expect(selected.getAllByRole("button", { name: /Ouvrir aperçu/u })).toHaveLength(2);
  await user.click(selected.getByRole("button", { name: "Ouvrir aperçu location-1" }));
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Stickers · location" })).toBeVisible();
  await user.click(map.getByRole("button", { name: "Fermer les aperçus du lieu" }));
  expect(map.queryByRole("region", { name: "Stories du lieu : Même nom" })).not.toBeInTheDocument();
  expect(modal.getByRole("combobox", { name: "Choisir un lieu" })).toHaveFocus();
  expect(table.getAllByRole("row")).toHaveLength(6);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "Carte des lieux" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tout afficher : location" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Tout afficher : music" }));
  expect(screen.queryByRole("region", { name: "Carte des lieux" })).not.toBeInTheDocument();
});

test("a location history without coordinates keeps every label and preview available", async () => {
  const { user } = await renderPage(
    TestTimelinePage,
    locationTimeline([[observation("partial", "missing", null)], []]),
    "/users/user_075",
  );
  await user.click(screen.getByRole("button", { name: "Tout afficher : location" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · location" }));
  expect(modal.getByText("0 lieux sur la carte")).toBeVisible();
  expect(modal.getByText("2 stickers sans position confirmée")).toBeVisible();
  expect(modal.getByText("1 localisation sans coordonnées")).toBeVisible();
  expect(
    modal.getByText(
      "Aucun lieu avec des coordonnées. Les stickers restent disponibles dans le tableau.",
    ),
  ).toBeVisible();
  expect(modal.queryByRole("region", { name: "Carte des lieux" })).not.toBeInTheDocument();
  expect(modal.getAllByText("Paris, Paris")).toHaveLength(2);
  await user.click(modal.getByRole("button", { name: "Ouvrir aperçu location-0" }));
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
});

test("metadata without a displayable sticker remains mappable through its story provenance", async () => {
  const props = {
    ...locationTimeline([[{ ...observation("unlabelled", "place"), occurrenceId: null }]]),
    stickerKinds: ["location"],
  };
  const { annotations } = props.timeline.stories[0].story;
  if (annotations !== undefined) {
    annotations.stickers = [];
  }
  const { user } = await renderPage(TestTimelinePage, props, "/users/user_075");
  await user.click(screen.getByRole("button", { name: "Tout afficher : location" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · location" }));
  expect(modal.getByText("1 lieu sur la carte")).toBeVisible();
  expect(modal.getByText("0 stickers sans position confirmée")).toBeVisible();
  expect(modal.getByText("0 localisations sans coordonnées")).toBeVisible();
  expect(modal.getByText("Aucun sticker de type location pour cet utilisateur.")).toBeVisible();
  await user.click(await modal.findByRole("button", { name: "Même nom" }));
  expect(
    within(modal.getByRole("region", { name: "Stories du lieu : Même nom" })).getByRole("button", {
      name: "Ouvrir aperçu location-0",
    }),
  ).toBeVisible();
});

test("overlapping anonymous places stay distinct and can each be selected without a pointer", async () => {
  const first = observation("first", "anonymous-a");
  const second = observation("second", "anonymous-b");
  first.metadata.instagramPlaceId = null;
  second.metadata.instagramPlaceId = null;
  const props = locationTimeline([[first, { ...first, id: "repeat" }], [second]]);
  const { user } = await renderPage(TestTimelinePage, props, "/users/user_075");
  await user.click(screen.getByRole("button", { name: "Tout afficher : location" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · location" }));
  await user.selectOptions(
    modal.getByRole("combobox", { name: "Choisir un lieu" }),
    "metadata:anonymous-b",
  );
  const selected = within(modal.getByRole("region", { name: "Stories du lieu : Même nom" }));
  expect(selected.getByRole("button", { name: "Ouvrir aperçu location-1" })).toBeVisible();
  expect(
    selected.queryByRole("button", { name: "Ouvrir aperçu location-0" }),
  ).not.toBeInTheDocument();
  await user.selectOptions(
    modal.getByRole("combobox", { name: "Choisir un lieu" }),
    "metadata:anonymous-a",
  );
  expect(selected.getAllByRole("button", { name: "Ouvrir aperçu location-0" })).toHaveLength(1);
  expect(modal.getByText("2 lieux sur la carte")).toBeVisible();
  expect(modal.getByText("0 stickers sans position confirmée")).toBeVisible();
  expect(modal.getByText("0 localisations sans coordonnées")).toBeVisible();
});

test("unlinked observations never supply a position for a separate legacy sticker", async () => {
  const props = locationTimeline([
    [
      { ...observation("unlinked", "mapped"), occurrenceId: null },
      { ...observation("partial", "unknown", null), occurrenceId: null },
    ],
  ]);
  const { user } = await renderPage(TestTimelinePage, props, "/users/user_075");
  await user.click(screen.getByRole("button", { name: "Tout afficher : location" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · location" }));
  expect(modal.getByText("1 sticker sans position confirmée")).toBeVisible();
  expect(modal.getByText("1 localisation sans coordonnées")).toBeVisible();
  expect(await modal.findByRole("button", { name: "Même nom" })).toBeVisible();
  expect(modal.getByText("Paris, Paris")).toBeVisible();
});

test("a place category appears in the place list but not in the map popup", async () => {
  const plain = observation("b", "place-b", 49);
  plain.metadata.name = "Sans catégorie";
  const props = locationTimeline([[observation("a", "place-a", 48, "Pont")], [plain]]);
  const { user } = await renderPage(TestTimelinePage, props, "/users/user_075");
  await user.click(screen.getByRole("button", { name: "Tout afficher : location" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · location" }));
  expect(modal.getByRole("option", { name: "Même nom · Pont · 1 stories" })).toBeVisible();
  expect(modal.getByRole("option", { name: "Sans catégorie · 1 stories" })).toBeVisible();
  const map = within(await modal.findByRole("region", { name: "Carte des lieux" }));
  await user.click(map.getByRole("button", { name: "Même nom" }));
  const popup = within(map.getByRole("region", { name: "Stories du lieu : Même nom" }));
  expect(popup.queryByText("Pont")).not.toBeInTheDocument();
  expect(popup.queryByText("1 story")).not.toBeInTheDocument();
});

test("arrow keys step through the markers of an open popup and wrap around", async () => {
  const second = observation("b", "place-b", 49);
  second.metadata.name = "Deuxième";
  const third = observation("c", "place-c", 50);
  third.metadata.name = "Troisième";
  const props = locationTimeline([[observation("a", "place-a")], [second], [third]]);
  const { user } = await renderPage(TestTimelinePage, props, "/users/user_075");
  await user.click(screen.getByRole("button", { name: "Tout afficher : location" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · location" }));
  const map = within(await modal.findByRole("region", { name: "Carte des lieux" }));
  await user.keyboard("{ArrowRight}");
  expect(modal.queryByRole("region", { name: /Stories du lieu/u })).not.toBeInTheDocument();
  await user.click(map.getByRole("button", { name: "Même nom" }));
  await user.keyboard("{ArrowRight}");
  expect(map.getByRole("region", { name: "Stories du lieu : Deuxième" })).toBeVisible();
  await user.keyboard("{ArrowRight}{ArrowRight}");
  expect(map.getByRole("region", { name: "Stories du lieu : Même nom" })).toBeVisible();
  await user.keyboard("{ArrowLeft}");
  expect(map.getByRole("region", { name: "Stories du lieu : Troisième" })).toBeVisible();
  await user.click(map.getByRole("button", { name: "Lieu suivant" }));
  expect(map.getByRole("region", { name: "Stories du lieu : Même nom" })).toBeVisible();
  await user.click(map.getByRole("button", { name: "Lieu précédent" }));
  expect(map.getByRole("region", { name: "Stories du lieu : Troisième" })).toBeVisible();
});

test("a single place has no previous or next buttons", async () => {
  const props = locationTimeline([[observation("a", "place-a")]]);
  const { user } = await renderPage(TestTimelinePage, props, "/users/user_075");
  await user.click(screen.getByRole("button", { name: "Tout afficher : location" }));
  const modal = within(await screen.findByRole("dialog", { name: "Stickers · location" }));
  await user.click(await modal.findByRole("button", { name: "Même nom" }));
  expect(modal.queryByRole("button", { name: "Lieu suivant" })).not.toBeInTheDocument();
});

test("location stickers show a crossed-out pin when the place has no coordinates", async () => {
  const props = locationTimeline([
    [observation("a", "place-a")],
    [observation("b", "partial", null)],
  ]);
  props.timeline.stories.push({
    ...props.timeline.stories[0],
    story: {
      ...props.timeline.stories[0].story,
      pk: "location-legacy",
      annotations: {
        locations: [],
        stickers: [{ kind: "location", label: "Legacy" }],
      },
    },
  });
  await renderPage(TestTimelinePage, props, "/users/user_075");
  const card = screen.getByRole("region", {
    name: "Type de sticker : location",
  });
  expect(card.querySelectorAll(".lucide-map-pin")).toHaveLength(1);
  expect(card.querySelectorAll(".lucide-map-pin-off")).toHaveLength(2);
});

test("location stickers show the place category on a separate line when known", async () => {
  const props = locationTimeline([
    [observation("a", "place-a", 48, "Parc")],
    [observation("b", "place-b")],
  ]);
  await renderPage(TestTimelinePage, props, "/users/user_075");
  const card = within(screen.getByRole("region", { name: "Type de sticker : location" }));
  expect(card.getByText("Parc")).toBeVisible();
  expect(card.getAllByText("Paris, Paris")).toHaveLength(2);
  expect(card.getAllByText(/Parc/u)).toHaveLength(1);
});
