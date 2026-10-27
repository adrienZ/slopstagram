import { MusicSticker } from "./music-sticker.tsx";
import { useState } from "react";
import { cn } from "cn";
import { ChevronLeftIcon, ChevronRightIcon, ExpandIcon } from "lucide-react";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import {
  formatStickerStoryDate,
  type StickerKindGroup,
  type StoryStickerGroup,
} from "../timeline-stickers.ts";
import { Sticker } from "./sticker.tsx";
import { presentSticker } from "../sticker-presentation.ts";
import type { SidebarUser } from "../sidebar-users.ts";
import { Button } from "../shadcn/ui/button.tsx";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "../shadcn/ui/card.tsx";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../shadcn/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../shadcn/ui/empty.tsx";
import { Pagination, PaginationContent, PaginationItem } from "../shadcn/ui/pagination.tsx";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "../shadcn/ui/table.tsx";
import { StoryCard } from "./story-card.tsx";
import { LocationHistory } from "./location-history.tsx";
import type { TimelineLocations } from "../timeline-locations.ts";

const STICKER_PAGE_SIZE = 3;

interface StickerTableProps {
  kind: string;
  stories: Array<StoryStickerGroup>;
  storyByMediaPk: Map<string, StoryCardViewModel>;
  users: Array<SidebarUser>;
  expanded?: boolean;
}

function StickerTable({
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
                <ul className="tw:flex tw:min-w-0 tw:flex-wrap tw:gap-1.5">
                  {kind === "music"
                    ? story.musicItems?.map(({ key, label, preview }) => (
                        <li key={key} className="tw:min-w-0 tw:max-w-full">
                          <MusicSticker label={label} preview={preview} />
                        </li>
                      ))
                    : story.labels.map(({ key, label }) => (
                        <li key={key} className="tw:min-w-0 tw:max-w-full">
                          <Sticker sticker={presentSticker(kind, label, users, expanded)} />
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

function StickerKindCard({
  group,
  locations,
  storyByMediaPk,
  users,
}: {
  group: StickerKindGroup;
  locations: TimelineLocations;
  storyByMediaPk: Map<string, StoryCardViewModel>;
  users: Array<SidebarUser>;
}) {
  const [page, setPage] = useState(1);
  const hasStories = group.stories.length > 0;
  const canExpand =
    hasStories ||
    (group.kind === "location" &&
      (locations.places.length > 0 || locations.unpositionedLocationCount > 0));
  const pageCount = Math.max(1, Math.ceil(group.stories.length / STICKER_PAGE_SIZE));
  const stickerStoryCount = group.stories.filter(({ labels }) => labels.length > 0).length;
  const occurrences = group.stories.reduce((count, story) => count + story.labels.length, 0);
  return (
    <Dialog>
      <Card
        size="sm"
        role="region"
        aria-label={`Type de sticker : ${group.kind}`}
        className="tw:h-84 tw:min-w-0 tw:overflow-hidden"
      >
        <CardHeader>
          <CardTitle>
            <h3 className="tw:capitalize">{group.kind}</h3>
          </CardTitle>
          <CardDescription>
            {`${occurrences} stickers · ${stickerStoryCount} stories`}
          </CardDescription>
          {canExpand && (
            <CardAction className="tw:flex tw:gap-0.5">
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Tout afficher : ${group.kind}`}>
                  <ExpandIcon />
                </Button>
              </DialogTrigger>
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
          <StickerTable
            kind={group.kind}
            stories={group.stories.slice((page - 1) * STICKER_PAGE_SIZE, page * STICKER_PAGE_SIZE)}
            storyByMediaPk={storyByMediaPk}
            users={users}
          />
        </CardContent>
        {pageCount > 1 && (
          <CardFooter className="tw:shrink-0">
            <Pagination aria-label={`Pagination : ${group.kind}`}>
              <PaginationContent>
                <PaginationItem>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Page précédente : ${group.kind}`}
                    disabled={page === 1}
                    onClick={() => {
                      setPage(page - 1);
                    }}
                  >
                    <ChevronLeftIcon />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <span className="tw:px-2 tw:text-xs tw:text-muted-foreground" aria-live="polite">
                    {page} / {pageCount}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Page suivante : ${group.kind}`}
                    disabled={page === pageCount}
                    onClick={() => {
                      setPage(page + 1);
                    }}
                  >
                    <ChevronRightIcon />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </CardFooter>
        )}
      </Card>

      {canExpand && (
        <DialogContent className="tw:max-h-[90svh] tw:overflow-y-auto tw:sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Stickers · {group.kind}</DialogTitle>
            <DialogDescription>
              {occurrences} stickers dans {stickerStoryCount} stories · historique complet
            </DialogDescription>
          </DialogHeader>
          {group.kind === "location" && (
            <LocationHistory locations={locations} storyByMediaPk={storyByMediaPk} />
          )}
          <StickerTable
            kind={group.kind}
            stories={group.stories}
            storyByMediaPk={storyByMediaPk}
            users={users}
            expanded
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

export function TimelineStickers({
  groups,
  locations,
  storyByMediaPk,
  users,
}: {
  groups: Array<StickerKindGroup>;
  locations: TimelineLocations;
  storyByMediaPk: Map<string, StoryCardViewModel>;
  users: Array<SidebarUser>;
}) {
  return (
    <section aria-label="Stickers" className="tw:mb-10">
      <h2 className="tw:mb-4 tw:text-xl tw:font-semibold">Stickers</h2>
      <div className="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] tw:gap-4">
        {groups.map((group) => (
          <StickerKindCard
            key={group.kind}
            group={group}
            locations={locations}
            storyByMediaPk={storyByMediaPk}
            users={users}
          />
        ))}
      </div>
    </section>
  );
}
