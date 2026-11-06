import type { TaggedPlaceRead, TaggedPlaceSummary } from "@@/core/domains/places/tagged-places.ts";
import { formatStickerStoryDate } from "../../utils/timeline-stickers.ts";

function formatStoryCount(count: number): string {
  return `${count} ${count > 1 ? "stories" : "story"}`;
}

function describePlace(place: TaggedPlaceSummary): string {
  return [place.name, place.category].filter((part) => part !== null).join(" · ");
}

/** The Tagged places the Assistant listed or found, as plain text. */
export function TaggedPlaceList({
  emptyLabel = "Aucun lieu.",
  label = "Lieux",
  places,
  total,
}: {
  emptyLabel?: string;
  label?: string;
  places: Array<TaggedPlaceSummary>;
  total: number;
}) {
  if (places.length === 0) {
    return <p>{emptyLabel}</p>;
  }
  return (
    <>
      <ul aria-label={label} className="tw:grid tw:gap-1">
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
      {total > places.length && (
        <p>
          {places.length} lieux sur {total}.
        </p>
      )}
    </>
  );
}

/** The Tagged place the Assistant read, as plain text: its address and latest stories. */
export function TaggedPlaceDetails({ read }: { read: TaggedPlaceRead }) {
  if (read.status === "unknown") {
    return <p>Aucun lieu n’a l’identifiant {read.id}.</p>;
  }
  const { place } = read;
  return (
    <section aria-label="Lieu lu" className="tw:grid tw:gap-1">
      <p className="tw:font-medium">{describePlace(place)}</p>
      {place.address !== null && <p>{place.address}</p>}
      <ul aria-label="Dernières stories" className="tw:grid tw:gap-1">
        {place.latestStories.map((story) => (
          <li key={`${story.date}-${story.owner}`}>
            <time dateTime={story.date}>{formatStickerStoryDate(story.date)}</time> · {story.owner}
          </li>
        ))}
      </ul>
      {place.hasMoreStories && <p>{formatStoryCount(place.storyCount)} au total.</p>}
    </section>
  );
}
