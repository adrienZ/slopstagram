import type { StoryOutputUser } from "../../sdk/lib/types.ts";
import { formatUserName, getUserTimelineUrl } from "../helper.ts";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { StoryCard } from "./story-card.tsx";

export interface UserSectionProps {
  user: StoryOutputUser;
  avatar?: string;
  summary?: string;
  stories: Array<StoryCardViewModel>;
}

export function UserSection({ user, avatar, summary, stories }: UserSectionProps) {
  const userName = formatUserName(user);

  return (
    <section className="tw:mb-10.5">
      <a
        className="tw:group tw:mb-3.5 tw:flex tw:items-center tw:gap-4.5 tw:text-inherit tw:no-underline"
        href={getUserTimelineUrl(user.username)}
      >
        {avatar !== undefined && avatar.length > 0 ? (
          <img
            className="tw:size-24 tw:rounded-lg tw:bg-muted tw:object-cover"
            src={avatar}
            alt={`${userName} avatar`}
            width="96"
            height="96"
          />
        ) : (
          <div className="tw:size-24 tw:rounded-lg tw:bg-muted" />
        )}
        <div>
          <h2 className="tw:mb-2.25 tw:text-[21px] tw:font-bold tw:group-hover:underline tw:group-focus-visible:underline">
            {userName}
          </h2>
        </div>
      </a>
      {summary !== undefined && summary.length > 0 && (
        <p className="tw:mb-4.5 tw:max-w-260 tw:text-[23px] tw:leading-[1.45]">{summary}</p>
      )}
      {stories.length > 0 && (
        <div className="tw:flex tw:snap-x tw:snap-mandatory tw:gap-3 tw:overflow-x-auto tw:pt-0.5 tw:pb-3.5">
          {stories.map((story) => (
            <StoryCard key={story.mediaPk} story={story} />
          ))}
        </div>
      )}
    </section>
  );
}
