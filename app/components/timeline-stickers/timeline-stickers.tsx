import type { SidebarUser } from "../../loaders/sidebar-users.ts";
import type { StoryCardData } from "../../utils/story-cards.ts";
import type { StickerKindGroup } from "../../utils/timeline-stickers.ts";
import type { TimelineLocations } from "../../utils/timeline-locations.ts";
import { StickerKindCard } from "./sticker-kind-card.tsx";

export function TimelineStickers({
  groups,
  locations,
  storyByMediaPk,
  users,
}: {
  groups: Array<StickerKindGroup>;
  locations: TimelineLocations;
  storyByMediaPk: Map<string, StoryCardData>;
  users: Array<SidebarUser>;
}) {
  return (
    <section aria-label="Stickers" className="tw:mb-10">
      <h2 className="tw:mb-4 tw:text-xl tw:font-semibold">Stickers</h2>
      <div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] tw:gap-4">
        {groups.map((group) => (
          <StickerKindCard
            key={group.kind}
            group={group}
            locations={locations}
            storyByMediaPk={storyByMediaPk}
            users={users}
          />
        ))}
      </div>
    </section>
  );
}
