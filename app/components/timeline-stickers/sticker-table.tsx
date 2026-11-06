import { cn } from "cn";
import type { SidebarUser } from "../../loaders/sidebar-users.ts";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../../shadcn/ui/empty.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shadcn/ui/table.tsx";
import { presentSticker } from "../../utils/sticker-presentation.ts";
import type { StoryCardData } from "../../utils/story-cards.ts";
import { formatStickerStoryDate, type StoryStickerGroup } from "../../utils/timeline-stickers.ts";
import { MusicSticker } from "../music-sticker.tsx";
import { Sticker } from "../sticker.tsx";
import { StoryCard } from "../story-card.tsx";

interface StickerTableProps {
  kind: string;
  stories: Array<StoryStickerGroup>;
  storyByMediaPk: Map<string, StoryCardData>;
  users: Array<SidebarUser>;
  expanded?: boolean;
}

export function StickerTable({
  kind,
  stories,
  storyByMediaPk,
  users,
  expanded = false,
}: StickerTableProps) {
  if (stories.length === 0) {
    return (
      <Empty className="tw:min-h-48 tw:px-2">
        <EmptyHeader>
          <EmptyTitle>Aucun sticker</EmptyTitle>
          <EmptyDescription>Aucun sticker de type {kind} pour cet utilisateur.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Table className="tw:table-fixed" aria-label={`Stickers : ${kind}`}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className={cn("tw:w-20", expanded && "tw:sm:w-64")}>
            Story
          </TableHead>
          <TableHead scope="col">Stickers</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stories.map((story) => {
          const card = storyByMediaPk.get(story.mediaPk);
          return (
            <TableRow key={story.mediaPk}>
              <TableCell
                className={cn(
                  "tw:w-20 tw:align-top tw:whitespace-normal",
                  expanded && "tw:sm:w-64",
                )}
              >
                <div
                  className={cn(
                    "tw:flex tw:flex-col tw:gap-1",
                    expanded && "tw:sm:flex-row tw:sm:items-center tw:sm:gap-3",
                  )}
                >
                  {card === undefined ? (
                    <span className="tw:text-xs tw:text-muted-foreground">Preview unavailable</span>
                  ) : (
                    <StoryCard story={card} size="sticker" />
                  )}
                  <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
                    <time className="tw:text-xs tw:text-muted-foreground" dateTime={story.date}>
                      {formatStickerStoryDate(story.date)}
                    </time>
                    {expanded && (
                      <span className="tw:text-xs tw:text-muted-foreground tw:wrap-anywhere">
                        {story.mediaPk}
                      </span>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="tw:min-w-0 tw:align-top tw:whitespace-normal">
                <ul className="tw:flex tw:min-w-0 tw:flex-wrap tw:items-start tw:gap-1.5">
                  {kind === "music"
                    ? story.musicItems?.map(({ key, label, preview }) => (
                        <li key={key} className="tw:min-w-0 tw:max-w-full">
                          <MusicSticker label={label} preview={preview} />
                        </li>
                      ))
                    : story.labels.map(({ key, label, place }) => (
                        <li key={key} className="tw:min-w-0 tw:max-w-full">
                          <Sticker sticker={presentSticker(kind, label, users, expanded, place)} />
                        </li>
                      ))}
                </ul>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
