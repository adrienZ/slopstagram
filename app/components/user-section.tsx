import type { StoryOutputUser } from "../../sdk/report-types.ts";
import { formatUserHandle, formatUserName, getUserTimelineUrl } from "../helper.ts";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { StoryCard } from "./story-card.tsx";
import { Card, CardHeader, CardTitle, CardContent } from "../shadcn/ui/card.tsx";
import { Separator } from "../shadcn/ui/separator.tsx";

export interface UserSectionProps {
  user: StoryOutputUser;
  avatar?: string;
  summary?: string;
  stories: Array<StoryCardViewModel>;
}

export function UserSection({ user, avatar, summary, stories }: UserSectionProps) {
  const userName = formatUserName(user);
  const displayName = user.full_name?.trim();
  const hasSummary = summary !== undefined && summary.length > 0;

  return (
    <section className="tw:mb-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <a
              className="tw:group tw:flex tw:items-center tw:gap-4.5 tw:text-inherit tw:no-underline"
              href={getUserTimelineUrl(user.username)}
            >
              {avatar !== undefined && avatar.length > 0 ? (
                <img
                  className="tw:size-20 tw:shrink-0 tw:rounded-full tw:bg-muted tw:object-cover"
                  src={avatar}
                  alt={`${userName} avatar`}
                  width="80"
                  height="80"
                />
              ) : (
                <div className="tw:size-20 tw:shrink-0 tw:rounded-full tw:bg-muted" />
              )}
              <div className="tw:min-w-0">
                <h2 className="tw:text-[21px] tw:font-bold tw:wrap-anywhere tw:group-hover:underline tw:group-focus-visible:underline">
                  {displayName !== undefined && displayName.length > 0
                    ? displayName
                    : formatUserHandle(user.username)}
                </h2>
                <span className="tw:mt-1 tw:block tw:text-sm tw:font-normal tw:text-muted-foreground">
                  {formatUserHandle(user.username)}
                </span>
              </div>
            </a>
          </CardTitle>
        </CardHeader>
        {hasSummary && (
          <>
            <Separator />
            <CardContent className="tw:bg-muted/40 tw:py-3">
              <p className="tw:max-w-260 tw:text-base tw:leading-relaxed tw:text-foreground tw:md:text-lg">
                {summary}
              </p>
            </CardContent>
            {stories.length > 0 && <Separator />}
          </>
        )}
        {stories.length > 0 && (
          <CardContent>
            <div className="tw:flex tw:snap-x tw:snap-mandatory tw:gap-3 tw:overflow-x-auto tw:pt-0.5 tw:pb-3.5">
              {stories.map((story) => (
                <StoryCard key={story.mediaPk} story={story} size="feed" />
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </section>
  );
}
