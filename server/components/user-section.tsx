import { css } from "mono-jsx/jsx-runtime";
import cx from "clsx";
import { getReportUserKey } from "../../sdk/lib/report-user-key-service.ts";
import type { StoryOutputUser } from "../../sdk/lib/types.ts";
import { formatUserName, getUserTimelineUrl } from "../helper.ts";
import type { ReportViewModel } from "../report-view-model.ts";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { StoryCard } from "./story-card.tsx";

interface UserSectionProps {
  user: StoryOutputUser;
  viewModel: ReportViewModel;
  stories: Array<StoryCardViewModel>;
}

export function UserSectionStyles() {
  return (
    <style>{css`
      @import url("/css/user-section.css");
    `}</style>
  );
}

export function UserSection({ user, viewModel, stories }: UserSectionProps) {
  const userName = formatUserName(user);
  const profilePicUrl = user.profile_pic_url?.trim();
  const avatar =
    profilePicUrl !== undefined && profilePicUrl.length > 0
      ? viewModel.cachedImages.profilePicPathByUrl.get(profilePicUrl)
      : undefined;
  const summary = viewModel.userSummaryByUserKey.get(getReportUserKey(user));

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
