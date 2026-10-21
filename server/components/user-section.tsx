import { Link } from "@solidjs/meta";
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

export function UserSectionStyles() {
  return <Link rel="stylesheet" href="/css/user-section.css" />;
}

export function UserSection({ user, avatar, summary, stories }: UserSectionProps) {
  const userName = formatUserName(user);

  return (
    <section class={cx("user-section")}>
      <a class={cx("user-link", "user-header")} href={getUserTimelineUrl(user.username)}>
        {avatar !== undefined && avatar.length > 0 ? (
          <img
            class={cx("avatar")}
            src={avatar}
            alt={`${userName} avatar`}
            width="96"
            height="96"
          />
        ) : (
          <div class={cx("avatar-placeholder")} />
        )}
        <div>
          <h2>{userName}</h2>
        </div>
      </a>
      {summary !== undefined && summary.length > 0 && <p class={cx("user-summary")}>{summary}</p>}
      {stories.length > 0 && (
        <div class={cx("story-images")}>
          {stories.map((story) => (
            <StoryCard story={story} />
          ))}
        </div>
      )}
    </section>
  );
}
