import type { StoryCardViewModel } from "../story-card-view-model.ts";
import type { UserTimeline } from "../user-timeline.ts";
import { formatStoryDay } from "../../sdk/lib/story-date-service.ts";
import { getTimelineDayId } from "../story-navigation.ts";
import { StoryCard } from "./story-card.tsx";

export function TimelineGallery({
  years,
  storyByMediaPk,
}: {
  years: UserTimeline["years"];
  storyByMediaPk: Map<string, StoryCardViewModel>;
}) {
  return (
    <section aria-label="Galerie des stories">
      {years.map((year) => (
        <section key={year.label} className="tw:mb-10">
          <h2 className="tw:mb-5 tw:text-2xl tw:font-semibold">{year.label}</h2>
          {year.months.map((month) => (
            <section key={month.key} className="tw:mb-8">
              <h3 className="tw:mb-5 tw:text-lg tw:font-medium tw:capitalize">{month.label}</h3>
              {month.days.map((day) => (
                <section
                  key={day.key}
                  id={getTimelineDayId(day.key)}
                  aria-label={day.key}
                  className="tw:mb-8 tw:scroll-mt-6"
                >
                  <header className="tw:mb-3 tw:flex tw:items-baseline tw:gap-3">
                    <h4 className="tw:text-sm tw:font-medium">{formatStoryDay(day.key)}</h4>
                    <span className="tw:text-xs tw:text-muted-foreground">
                      {day.stories.length} stories
                    </span>
                  </header>
                  <div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(125px,1fr))] tw:gap-1.5 tw:sm:grid-cols-[repeat(auto-fill,minmax(175px,1fr))]">
                    {day.stories.map((entry) => {
                      const card = storyByMediaPk.get(entry.story.pk);
                      return card === undefined ? null : (
                        <StoryCard key={card.mediaPk} story={card} size="gallery" />
                      );
                    })}
                  </div>
                </section>
              ))}
            </section>
          ))}
        </section>
      ))}
    </section>
  );
}
