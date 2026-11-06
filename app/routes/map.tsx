import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { z } from "zod";
import { AccountChecklist, AccountFilter } from "../components/account-filter.tsx";
import { Lightbox } from "../components/lightbox/lightbox.tsx";
import { PlaceExplorer } from "../components/place-explorer/place-explorer.tsx";
import { useMediaQuery } from "../hooks/use-media-query.ts";
import { usePlaceMapFilter } from "../hooks/use-place-map-filter.ts";
import type { PlaceMapPageData } from "../loaders/place-map.ts";
import { getPlaceMap } from "../query-service.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { formatUserInitials } from "../utils/helper.ts";
import { PLACE_SEARCH_PARAM } from "../utils/place-map-link.ts";
import type { TimelinePlace } from "../utils/timeline-locations.ts";

export function PlaceMapPage({
  places,
  accounts,
  stories,
  selectedAccounts,
  selectedPlace,
  selectedStory,
}: PlaceMapPageData & {
  selectedAccounts?: string;
  selectedPlace?: string;
  selectedStory?: string;
}) {
  const filter = usePlaceMapFilter(places, accounts, {
    accounts: selectedAccounts,
    place: selectedPlace,
  });
  const placeFilter =
    filter.place === undefined
      ? undefined
      : { name: filter.place.name, onRemove: filter.removePlace };
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const storyByMediaPk = new Map(stories.map((story) => [story.mediaPk, story]));
  const avatarByUsername = new Map(accounts.map((account) => [account.username, account]));
  function renderMarker(place: TimelinePlace) {
    const username = place.stories[0]?.username ?? "";
    return (
      <Avatar className="tw:size-10">
        <AvatarImage src={avatarByUsername.get(username)?.avatarPath} alt="" />
        <AvatarFallback className="tw:bg-primary tw:text-primary-foreground">
          {formatUserInitials(username)}
        </AvatarFallback>
      </Avatar>
    );
  }
  return (
    <>
      <header className="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-3 tw:border-b tw:px-4">
        <a
          href="/report"
          className="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-muted-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" className="tw:size-4" />
          Stories
        </a>
        <h1 className="tw:text-sm tw:font-semibold">Carte</h1>
      </header>
      <main className="tw:mx-auto tw:w-full tw:max-w-360 tw:gap-6 tw:px-6 tw:pt-8 tw:pb-12 tw:max-[760px]:px-4 tw:max-[760px]:py-6 tw:max-lg:space-y-3 tw:lg:grid tw:lg:grid-cols-4">
        {isDesktop ? (
          // The panel spans the row, down to the bottom of the map; its list scrolls inside it.
          <aside aria-label="Filtres" className="tw:relative tw:lg:col-span-1">
            <div className="tw:absolute tw:inset-0 tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:p-3">
              <h2 className="tw:text-sm tw:font-semibold">Filtrer par compte</h2>
              <AccountChecklist
                accounts={accounts}
                selected={filter.selected}
                onToggle={filter.toggle}
                onClear={filter.clear}
                place={placeFilter}
                listClassName="tw:min-h-0 tw:flex-1"
              />
            </div>
          </aside>
        ) : (
          <AccountFilter
            accounts={accounts}
            selected={filter.selected}
            onToggle={filter.toggle}
            onClear={filter.clear}
            place={placeFilter}
          />
        )}
        <div className="tw:space-y-3 tw:lg:col-span-3">
          {filter.places.length === 0 ? (
            <p>Aucun lieu avec des coordonnées à afficher.</p>
          ) : (
            <PlaceExplorer
              places={filter.places}
              initialSelectedId={filter.place?.id}
              storyByMediaPk={storyByMediaPk}
              showOwner
              renderMarker={renderMarker}
              mapClassName="tw:aspect-4/3 tw:w-full tw:lg:aspect-video"
              tileErrorMessage="Fond de carte indisponible. Le choix du lieu reste accessible."
            />
          )}
        </div>
      </main>
      <Lightbox stories={stories} selectedStory={selectedStory} linkToProfile />
    </>
  );
}

export const Route = createFileRoute("/map")({
  validateSearch: z.object({
    accounts: z.string().optional(),
    [PLACE_SEARCH_PARAM]: z.coerce.string().optional(),
    story: z.coerce.string().optional(),
  }),
  loader: async () => await getPlaceMap(),
  head: () => ({ meta: [{ title: "Carte des lieux" }] }),
  component: () => {
    const search = Route.useSearch();
    return (
      <PlaceMapPage
        {...Route.useLoaderData()}
        selectedAccounts={search.accounts}
        selectedPlace={search[PLACE_SEARCH_PARAM]}
        selectedStory={search.story}
      />
    );
  },
});
