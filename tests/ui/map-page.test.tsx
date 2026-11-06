import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route } from "../../app/routes/map.tsx";
import { loadPlaceMap } from "../../app/loaders/place-map.ts";
import { LocationMapContext } from "../../app/components/place-explorer/place-explorer.tsx";
import type { LocationMapCanvasProps } from "../../app/components/place-explorer/location-map-canvas.tsx";
import { createPageRenderer } from "../render-page.ts";
import { createTestRuntime, useSharedTestRuntime } from "../setup/test-runtime.ts";
import { mapAccounts, seedMapDatabase, sharedPlace, soloPlace } from "./seeded-pages.ts";

const shared = useSharedTestRuntime(seedMapDatabase);
const renderer = createPageRenderer(Route, () => loadPlaceMap(shared.runtime), "/map");
const [ada, ben, cleo] = mapAccounts;
const sharedPlaceId = "instagram:700000000000930";
const placeLink = `/map?place=${encodeURIComponent(sharedPlaceId)}`;

// Only the WebGL/tile boundary is replaced: markers render what the page asks them to.
function TestMapCanvas({ places, onSelect, renderMarker, children }: LocationMapCanvasProps) {
  return (
    <div role="region" aria-label="Carte des lieux">
      {places.map((place) => (
        <button
          key={place.id}
          type="button"
          aria-label={place.name}
          data-place-id={place.id}
          onClick={() => {
            onSelect(place.id);
          }}
        >
          {renderMarker?.(place)}
        </button>
      ))}
      {children}
    </div>
  );
}

function MapWrapper({ children }: { children: ReactNode }) {
  return <LocationMapContext value={TestMapCanvas}>{children}</LocationMapContext>;
}

async function mountMap(url = "/map") {
  const mounted = await renderer.mountRoute(url, undefined, { wrapper: MapWrapper });
  const map = within(await screen.findByRole("region", { name: "Carte des lieux" }));
  return { ...mounted, map };
}

test("every place shows the initials of its latest story's owner", async () => {
  const { map } = await mountMap();
  expect(map.getAllByRole("button")).toHaveLength(2);
  expect(within(map.getByRole("button", { name: sharedPlace.name })).getByText("CL")).toBeVisible();
  expect(within(map.getByRole("button", { name: soloPlace.name })).getByText("BE")).toBeVisible();
});

test("a place popup lists every account's stories with their owner and date", async () => {
  const { user, map } = await mountMap();
  await user.click(map.getByRole("button", { name: sharedPlace.name }));
  const popup = within(map.getByRole("region", { name: `Stories du lieu : ${sharedPlace.name}` }));
  expect(popup.getByRole("link", { name: `@${cleo}` })).toHaveAttribute("href", `/users/${cleo}`);
  expect(popup.getByRole("link", { name: `@${ada}` })).toHaveAttribute("href", `/users/${ada}`);
  expect(popup.getAllByRole("button", { name: /Ouvrir aperçu/u })).toHaveLength(2);
  expect(popup.getAllByRole("time")).toHaveLength(2);
  await user.click(popup.getByRole("button", { name: `Ouvrir aperçu ${sharedPlace.oldestPk}` }));
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
});

test("the account filter keeps the places of any chosen account, in the URL", async () => {
  const { user, map, router } = await mountMap();
  await user.click(screen.getByRole("button", { name: /Filtrer par compte/u }));
  const filter = within(await screen.findByRole("dialog"));
  expect(
    filter.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label")),
  ).toStrictEqual([`@${ada}`, `@${ben}`, `@${cleo}`]);
  await user.click(filter.getByRole("checkbox", { name: `@${ada}` }));
  expect(router.state.location.search).toEqual({ accounts: ada });
  expect(map.getAllByRole("button")).toHaveLength(1);
  const marker = map.getByRole("button", { name: sharedPlace.name });
  expect(within(marker).getByText("AD")).toBeVisible();
  await user.click(filter.getByRole("checkbox", { name: `@${ben}` }));
  expect(router.state.location.search).toEqual({ accounts: `${ada},${ben}` });
  expect(map.getAllByRole("button")).toHaveLength(2);
  await user.click(filter.getByRole("button", { name: "Effacer les filtres" }));
  expect(router.state.location.search).toEqual({});
  expect(map.getAllByRole("button")).toHaveLength(2);
  expect(within(map.getByRole("button", { name: sharedPlace.name })).getByText("CL")).toBeVisible();
});

test("a filtered link shows only the chosen accounts' stories and ignores unknown accounts", async () => {
  const { user, map } = await mountMap(`/map?accounts=${ada},unknown_account`);
  expect(screen.getByRole("button", { name: /Filtrer par compte/u })).toHaveTextContent("1");
  expect(map.getAllByRole("button")).toHaveLength(1);
  await user.click(map.getByRole("button", { name: sharedPlace.name }));
  const popup = within(map.getByRole("region", { name: `Stories du lieu : ${sharedPlace.name}` }));
  expect(popup.getByRole("link", { name: `@${ada}` })).toBeVisible();
  expect(popup.queryByRole("link", { name: `@${cleo}` })).not.toBeInTheDocument();
  expect(popup.queryByRole("button", { name: "Lieu suivant" })).not.toBeInTheDocument();
});

test("the place select and arrow keys step through the visible places only", async () => {
  const { user, map } = await mountMap();
  const select = screen.getByRole("combobox", { name: "Choisir un lieu" });
  expect(within(select).getAllByRole("option")).toHaveLength(3);
  await user.selectOptions(select, "instagram:700000000000940");
  expect(map.getByRole("region", { name: `Stories du lieu : ${soloPlace.name}` })).toBeVisible();
  await user.click(map.getByRole("button", { name: soloPlace.name }));
  await user.keyboard("{ArrowRight}");
  expect(map.getByRole("region", { name: `Stories du lieu : ${sharedPlace.name}` })).toBeVisible();
  await user.click(map.getByRole("button", { name: "Lieu précédent" }));
  expect(map.getByRole("region", { name: `Stories du lieu : ${soloPlace.name}` })).toBeVisible();
});

test("without any mapped place the page explains why the map is empty", async (context) => {
  const empty = loadPlaceMap(await createTestRuntime(context));
  await renderer.mountRoute("/map", empty, { wrapper: MapWrapper });
  expect(screen.getByText("Aucun lieu avec des coordonnées à afficher.")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Carte des lieux" })).not.toBeInTheDocument();
});

test("a place hidden by the filter does not reopen its popup when shown again", async () => {
  const { user, map } = await mountMap();
  await user.click(map.getByRole("button", { name: soloPlace.name }));
  await user.click(screen.getByRole("button", { name: /Filtrer par compte/u }));
  const filter = within(await screen.findByRole("dialog"));
  await user.click(filter.getByRole("checkbox", { name: `@${ada}` }));
  await user.click(filter.getByRole("button", { name: "Effacer les filtres" }));
  expect(map.getByRole("button", { name: soloPlace.name })).toBeVisible();
  expect(map.queryByRole("region", { name: /Stories du lieu/u })).not.toBeInTheDocument();
});

test("a place link shows only that place, with its popup open", async () => {
  const { map } = await mountMap(placeLink);
  expect(map.getByRole("button", { name: sharedPlace.name })).toBeVisible();
  expect(map.queryByRole("button", { name: soloPlace.name })).not.toBeInTheDocument();
  const popup = within(map.getByRole("region", { name: `Stories du lieu : ${sharedPlace.name}` }));
  expect(popup.getAllByRole("button", { name: /Ouvrir aperçu/u })).toHaveLength(2);
  expect(screen.getByRole("button", { name: /Filtrer par compte/u })).toHaveTextContent("1");
});

test("a link to an unknown place is ignored", async () => {
  const { map, user } = await mountMap("/map?place=instagram%3A700000000000999");
  expect(map.getAllByRole("button")).toHaveLength(2);
  expect(map.queryByRole("region", { name: /Stories du lieu/u })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Filtrer par compte/u }));
  const filter = within(await screen.findByRole("dialog"));
  expect(filter.queryByRole("button", { name: /Retirer le lieu/u })).not.toBeInTheDocument();
  expect(filter.getByRole("button", { name: "Effacer les filtres" })).toBeDisabled();
});

test("a place link keeps only the chosen accounts' stories of that place", async () => {
  const { map } = await mountMap(`${placeLink}&accounts=${ada}`);
  const popup = within(map.getByRole("region", { name: `Stories du lieu : ${sharedPlace.name}` }));
  expect(popup.getByRole("link", { name: `@${ada}` })).toBeVisible();
  expect(popup.queryByRole("link", { name: `@${cleo}` })).not.toBeInTheDocument();
});

test("a place link no chosen account tagged shows the empty state", async () => {
  await renderer.mountRoute(`${placeLink}&accounts=${ben}`, undefined, { wrapper: MapWrapper });
  expect(screen.getByText("Aucun lieu avec des coordonnées à afficher.")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Carte des lieux" })).not.toBeInTheDocument();
});

test("the place filter is an entry at the top of the filters, which removes it", async () => {
  const { user, map, router } = await mountMap(`${placeLink}&accounts=${ada}`);
  await user.click(screen.getByRole("button", { name: /Filtrer par compte/u }));
  const filter = within(await screen.findByRole("dialog"));
  const [clear, remove] = filter.getAllByRole("button");
  expect(clear).toHaveAccessibleName("Effacer les filtres");
  expect(remove).toHaveAccessibleName(`Retirer le lieu ${sharedPlace.name}`);
  expect(filter.getByText(sharedPlace.name)).toBeVisible();
  await user.click(filter.getByRole("button", { name: `Retirer le lieu ${sharedPlace.name}` }));
  expect(router.state.location.search).toEqual({ accounts: ada });
  expect(filter.queryByText(sharedPlace.name)).not.toBeInTheDocument();
  expect(map.getByRole("button", { name: sharedPlace.name })).toBeVisible();
  expect(map.queryByRole("button", { name: soloPlace.name })).not.toBeInTheDocument();
});

test("one clear action resets the place and the accounts together", async () => {
  const { user, map, router } = await mountMap(`${placeLink}&accounts=${ada}`);
  await user.click(screen.getByRole("button", { name: /Filtrer par compte/u }));
  const filter = within(await screen.findByRole("dialog"));
  await user.click(filter.getByRole("button", { name: "Effacer les filtres" }));
  expect(router.state.location.search).toEqual({});
  expect(map.getByRole("button", { name: sharedPlace.name })).toBeVisible();
  expect(map.getByRole("button", { name: soloPlace.name })).toBeVisible();
  expect(filter.getByRole("button", { name: "Effacer les filtres" })).toBeDisabled();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("on desktop the account filters are an inline list beside the map", async () => {
  // jsdom has no matchMedia: answer the desktop breakpoint only.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const { user, map, router } = await mountMap();
  expect(screen.queryByRole("button", { name: /Filtrer par compte/u })).not.toBeInTheDocument();
  const filters = within(screen.getByRole("complementary", { name: "Filtres" }));
  expect(filters.getAllByRole("checkbox")).toHaveLength(3);
  await user.click(filters.getByRole("checkbox", { name: `@${ada}` }));
  expect(router.state.location.search).toEqual({ accounts: ada });
  expect(map.getAllByRole("button")).toHaveLength(1);
});
