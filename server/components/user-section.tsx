import { css, cx } from "hono/css";
import { getReportUserKey } from "../../scripts/lib/report-user-key-service.ts";
import type { StoryOutputUser } from "../../scripts/lib/types.ts";
import { formatUserName } from "../helper.ts";
import type { ReportViewModel } from "../report-view-model.ts";
import { StoryCard } from "./story-card.tsx";

type UserSectionProps = {
  user: StoryOutputUser;
  viewModel: ReportViewModel;
};

const sectionClass = css`
  margin: 0 0 42px;
`;

const headerClass = css`
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 14px;
`;

const avatarClass = css`
  width: 96px;
  height: 96px;
  border-radius: 8px;
  object-fit: cover;
  background: #d9dee7;
`;

const summaryClass = css`
  max-width: 1040px;
  margin: 0 0 18px;
  font-size: 23px;
  line-height: 1.45;
`;

const storyImagesClass = css`
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 2px 0 14px;
`;

export function UserSection({ user, viewModel }: UserSectionProps) {
  const userName = formatUserName(user);
  const avatar = user.profile_pic_url
    ? viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url)
    : undefined;
  const summary = viewModel.userSummaryByUserKey.get(getReportUserKey(user));

  return (
    <section class={cx("user-section", sectionClass)}>
      <div class={cx("user-header", headerClass)}>
        {avatar ? (
          <img
            class={cx("avatar", avatarClass)}
            src={avatar}
            alt={`${userName} avatar`}
            width="96"
            height="96"
          />
        ) : (
          <div class={cx("avatar-placeholder", avatarClass)} />
        )}
        <div>
          <h2>{userName}</h2>
        </div>
      </div>
      {summary && <p class={cx("user-summary", summaryClass)}>{summary}</p>}
      {user.stories.length > 0 && (
        <div class={cx("story-images", storyImagesClass)}>
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
