import "@tanstack/react-start/server-only";
import { media } from "@@/core/domains/media-store/media-urls.ts";
import {
  readMentionConnections,
  type MentionConnectionsRuntime,
  type MentionTarget,
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

function toGraphPoint(target: MentionTarget): MentionGraphPoint {
  if (target.kind === "account") {
    return {
      kind: "account",
      id: target.id,
      label: target.label,
      username: target.username,
      fullName: target.fullName,
      avatarPath: media.image.avatar(target.pk).url,
    };
  }
  return {
    kind: "unknown",
    id: target.id,
    label:
      target.kind === "ambiguous-username" ? `${target.label} (plusieurs comptes)` : target.label,
  };
}

/** `source` and `target` only name the two ends: who mentioned whom is in the source stories. */
export function loadMentionGraph(runtime: MentionConnectionsRuntime) {
  const { targets, connections } = readMentionConnections(runtime);
  return {
    points: targets.map(toGraphPoint),
    connections: connections.map(({ id, targetIds: [source, target], observations }) => ({
      id,
      source,
      target,
      storyCount: observations.length,
    })),
  };
}

export type MentionGraphPageData = ReturnType<typeof loadMentionGraph>;
