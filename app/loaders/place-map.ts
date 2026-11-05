import "@tanstack/react-start/server-only";
import type { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import { groupTimelineLocations } from "../utils/timeline-locations.ts";
import { createOwnerStoryCards } from "./account-timeline.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";

interface PlaceMapRuntime {
  appleVision: Pick<AppleVisionRepository, "findByMediaPk">;
  stories: Pick<StoryRepository, "listWithLocationObservations">;
  users: Pick<InstagramUserRepository, "listAll">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

/**
 * Every tagged place with usable coordinates, across all accounts and all time, the latest
 * story first; the accounts that tagged one of them; and the story cards of their stories.
 */
export function loadPlaceMap(runtime: PlaceMapRuntime) {
  const located = runtime.stories.listWithLocationObservations();
  const { places } = groupTimelineLocations(located);
  const mappedPks = new Set(places.flatMap((place) => place.stories.map(({ mediaPk }) => mediaPk)));
  const storiesByOwner = Map.groupBy(
    located.filter((entry) => mappedPks.has(entry.story.pk)),
    (entry) => entry.username,
  );
  const sidebarUsers = loadSidebarUsers(runtime);
  const order = new Map(located.map((entry, index) => [entry.story.pk, index]));
  return {
    places,
    accounts: sidebarUsers
      .filter(({ username }) => storiesByOwner.has(username))
      .toSorted((left, right) => left.username.localeCompare(right.username)),
    // Newest first, so the lightbox steps through the stories in time order.
    stories: [...storiesByOwner.values()]
      .flatMap((owned) => createOwnerStoryCards(runtime, owned, sidebarUsers))
      .toSorted(
        (left, right) =>
          (order.get(left.mediaPk) ?? Infinity) - (order.get(right.mediaPk) ?? Infinity),
      ),
  };
}

export type PlaceMapPageData = ReturnType<typeof loadPlaceMap>;
