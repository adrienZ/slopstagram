import "@tanstack/react-start/server-only";
import type { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import { media } from "@@/core/domains/media-store/media-urls.ts";
import {
  readMentionConnections,
  type MentionConnectionsRuntime,
  type MentionPoint,
} from "@@/core/domains/mention-connections/mention-connections.ts";
import { createOwnerStoryCards } from "./account-timeline.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";

interface MentionGraphRuntime extends MentionConnectionsRuntime {
  appleVision: Pick<AppleVisionRepository, "findByMediaPk">;
  stories: Pick<StoryRepository, "listMentionOccurrences" | "listWithMentionStickers">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

/** A known Account, drawn with its avatar, or an abstract point for anyone else. */
type MentionGraphPoint =
  | {
      kind: "account";
      id: string;
      label: string;
      username: string;
      fullName: string | null;
      avatarPath: string;
    }
  | { kind: "unknown"; id: string; label: string };

function toGraphPoint(point: MentionPoint): MentionGraphPoint {
  if (point.kind === "account") {
    return {
      kind: "account",
      id: point.id,
      label: point.label,
      username: point.username,
      fullName: point.fullName,
      avatarPath: media.image.avatar(point.pk).url,
    };
  }
  return {
    kind: "unknown",
    id: point.id,
    label: point.kind === "ambiguous-username" ? `${point.label} (plusieurs comptes)` : point.label,
  };
}

/**
 * Every Mention connection of the stored history, one per pair of points with its source
 * stories, newest first, and the story cards of those stories. `source` and `target` only name
 * the two ends: who mentioned whom is in the source stories.
 */
export function loadMentionGraph(runtime: MentionGraphRuntime) {
  const { points, connections } = readMentionConnections(runtime);
  const sourcePks = new Set(
    connections.flatMap(({ observations }) => observations.map(({ storyPk }) => storyPk)),
  );
  const sources = runtime.stories
    .listWithMentionStickers()
    .filter(({ story }) => sourcePks.has(story.pk));
  const sidebarUsers = loadSidebarUsers(runtime);
  return {
    points: points.map(toGraphPoint),
    connections: connections.map(({ id, pointIds: [source, target], observations }) => ({
      id,
      source,
      target,
      storyPks: observations.map(({ storyPk }) => storyPk),
    })),
    stories: [...Map.groupBy(sources, ({ owner_pk }) => owner_pk).values()].flatMap((owned) =>
      createOwnerStoryCards(runtime, owned, sidebarUsers),
    ),
  };
}

export type MentionGraphPageData = ReturnType<typeof loadMentionGraph>;
