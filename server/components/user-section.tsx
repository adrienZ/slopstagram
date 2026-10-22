import cx from "clsx";
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
    <section className={cx("user-section")}>
      <a className={cx("user-link", "user-header")} href={getUserTimelineUrl(user.username)}>
        {avatar !== undefined && avatar.length > 0 ? (
          <img
            className={cx("avatar")}
            src={avatar}
            alt={`${userName} avatar`}
            width="96"
            height="96"
          />
        ) : (
          <div className={cx("avatar-placeholder")} />
        )}
        <div>
          <h2>{userName}</h2>
        </div>
      </a>
      {summary !== undefined && summary.length > 0 && (
        <p className={cx("user-summary")}>{summary}</p>
      )}
      {stories.length > 0 && (
        <div className={cx("story-images")}>
          {stories.map((story) => (
            <StoryCard key={story.mediaPk} story={story} />
          ))}
        </div>
      )}
    </section>
  );
}
