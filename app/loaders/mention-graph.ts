import "@tanstack/react-start/server-only";
import { media } from "@@/core/domains/media-store/media-urls.ts";
import {
  readMentionConnections,
  type MentionConnectionsRuntime,
  type MentionPoint,
} from "@@/core/domains/mention-connections/mention-connections.ts";

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
 * Every Mention connection of the stored history, one per pair of points with its story count.
 * `source` and `target` only name the two ends: who mentioned whom is in the source stories.
 */
export function loadMentionGraph(runtime: MentionConnectionsRuntime) {
  const { points, connections } = readMentionConnections(runtime);
  return {
    points: points.map(toGraphPoint),
    connections: connections.map(({ id, pointIds: [source, target], observations }) => ({
      id,
      source,
      target,
      storyCount: observations.length,
    })),
  };
}

export type MentionGraphPageData = ReturnType<typeof loadMentionGraph>;
