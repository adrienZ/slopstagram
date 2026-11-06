import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ExpandIcon } from "lucide-react";
import type { SidebarUser } from "../../loaders/sidebar-users.ts";
import { Button } from "../../shadcn/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../shadcn/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../shadcn/ui/dialog.tsx";
import { Pagination, PaginationContent, PaginationItem } from "../../shadcn/ui/pagination.tsx";
import type { StoryCardData } from "../../utils/story-cards.ts";
import type { StickerKindGroup } from "../../utils/timeline-stickers.ts";
import type { TimelineLocations } from "../../utils/timeline-locations.ts";
import { LocationHistory } from "../location-history.tsx";
import { StickerTable } from "./sticker-table.tsx";

const STICKER_PAGE_SIZE = 3;

/** A sticker kind: a page of its stories, and all of them, with the location history, in a dialog. */
export function StickerKindCard({
  group,
  locations,
  storyByMediaPk,
  users,
}: {
  group: StickerKindGroup;
  locations: TimelineLocations;
  storyByMediaPk: Map<string, StoryCardData>;
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
