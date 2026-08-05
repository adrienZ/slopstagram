import { getReportUserKey } from "../../scripts/lib/report-user-key-service.ts";
import type { StoryOutputUser } from "../../scripts/lib/types.ts";
import { formatUserName } from "../helper.ts";
import type { ReportViewModel } from "../report-view-model.ts";
import { StoryCard } from "./story-card.tsx";

type UserSectionProps = {
  user: StoryOutputUser;
  viewModel: ReportViewModel;
};

export function UserSection({ user, viewModel }: UserSectionProps) {
  const userName = formatUserName(user);
  const avatar = user.profile_pic_url
    ? viewModel.cachedImages.profilePicPathByUrl.get(user.profile_pic_url)
    : undefined;
  const summary = viewModel.userSummaryByUserKey.get(
    getReportUserKey(user),
  );

  return (
    <section class="user-section">
      <div class="user-header">
        {avatar ? (
          <img class="avatar" src={avatar} alt={`${userName} avatar`} width="96" height="96" />
        ) : (
          <div class="avatar-placeholder" />
        )}
        <div><h2>{userName}</h2></div>
      </div>
      {summary && <p class="user-summary">{summary}</p>}
      {user.stories.length > 0 && (
        <div class="story-images">
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
