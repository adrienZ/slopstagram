import cx from "clsx";
import { css } from "mono-jsx/jsx-runtime";
import { getReportUserKey } from "../../sdk/lib/report-user-key-service.ts";
import type { StoryOutputUser } from "../../sdk/lib/types.ts";
import { formatUserName } from "../helper.ts";
import type { ReportViewModel } from "../report-view-model.ts";
import { StoryCard } from "./story-card.tsx";

type UserSectionProps = {
  user: StoryOutputUser;
  viewModel: ReportViewModel;
};

export const userSectionStyles = css`
  .user-section {
    margin: 0 0 42px;
  }

  .user-header {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 14px;
  }

  .avatar,
  .avatar-placeholder {
    width: 96px;
    height: 96px;
    border-radius: 8px;
    object-fit: cover;
    background: #d9dee7;
  }

  .user-summary {
    max-width: 1040px;
    margin: 0 0 18px;
    font-size: 23px;
    line-height: 1.45;
  }

  .story-images {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding: 2px 0 14px;
  }
`;

export function UserSectionStyles() {
  return <style>{userSectionStyles}</style>;
}

export function UserSection({ user, viewModel }: UserSectionProps) {
  const userName = formatUserName(user);
  const avatar =
    user.profile_pic_url !== null && user.profile_pic_url.length > 0
      ? viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url)
      : undefined;
  const summary = viewModel.userSummaryByUserKey.get(getReportUserKey(user));

  return (
    <section class={cx("user-section")}>
      <div class={cx("user-header")}>
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
      </div>
      {summary !== undefined && summary.length > 0 && <p class={cx("user-summary")}>{summary}</p>}
      {user.stories.length > 0 && (
        <div class={cx("story-images")}>
          {user.stories.map((story, position) => (
            <StoryCard
              story={story}
              user={user}
              userName={userName}
              count={user.stories.length}
              position={position + 1}
              viewModel={viewModel}
            />
          ))}
        </div>
      )}
    </section>
  );
}
