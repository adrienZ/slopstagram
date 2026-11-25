import { useTranslation } from "react-i18next";
import type { TaggedPlaceRead, TaggedPlaceSummary } from "@@/core/domains/places/tagged-places.ts";
import { formatStoryCount } from "../utils/helper.ts";
import { formatStickerStoryDate } from "../utils/timeline-stickers.ts";

function describePlace(place: TaggedPlaceSummary): string {
  return [place.name, place.category].filter((part) => part !== null).join(" · ");
}

export function TaggedPlaceList({
  emptyLabel,
  label,
  places,
  total,
}: {
  emptyLabel?: string;
  label?: string;
  places: Array<TaggedPlaceSummary>;
  total: number;
}) {
  const { t } = useTranslation();

  if (places.length === 0) {
    return <p>{emptyLabel ?? t("assistant.noPlaces")}</p>;
  }

  return (
    <>
      <ul aria-label={label ?? t("assistant.places")} className="tw:grid tw:gap-1">
        {places.map((place) => (
          <li key={place.id}>
            {[
              describePlace(place),
              formatStoryCount(place.storyCount),
              place.owners.join(", "),
            ].join(" · ")}
          </li>
        ))}
      </ul>
      {total > places.length && <p>{t("assistant.placesOf", { shown: places.length, total })}</p>}
    </>
  );
}

export function TaggedPlaceDetails({ read }: { read: TaggedPlaceRead }) {
  const { t } = useTranslation();

  if (read.status === "unknown") {
    return <p>{t("assistant.unknownPlace", { id: read.id })}</p>;
  }

  const { place } = read;

  return (
    <section aria-label={t("assistant.placeRead")} className="tw:grid tw:gap-1">
      <p className="tw:font-medium">{describePlace(place)}</p>
      {place.address !== null && <p>{place.address}</p>}
      <ul aria-label={t("assistant.latestStories")} className="tw:grid tw:gap-1">
        {place.latestStories.map((story) => (
          <li key={`${story.date}-${story.owner}`}>
            <time dateTime={story.date}>{formatStickerStoryDate(story.date)}</time> · {story.owner}
          </li>
        ))}
      </ul>
      {place.hasMoreStories && <p>{t("assistant.storiesTotal", { count: place.storyCount })}</p>}
    </section>
  );
}
