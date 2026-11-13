import "@tanstack/react-start/server-only";
import type { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import { media } from "@@/core/domains/media-store/media-urls.ts";
import {
  keepNeighborhoods,
  readMentionConnections,
  type MentionConnections,
  type MentionConnectionsRuntime,
  type MentionTarget,
} from "@@/core/domains/mention-connections/mention-connections.ts";
import { createOwnerStoryCards } from "./account-timeline.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";

interface MentionGraphRuntime extends MentionConnectionsRuntime {
  appleVision: Pick<AppleVisionRepository, "findByMediaPk">;
  stories: Pick<StoryRepository, "listMentionOccurrences" | "listTimelineStories">;
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

/**
 * The Accounts the graph can be filtered by: those it draws, by username. Filters naming any
 * other username are skipped whole, so a shared URL never shows a partial graph as the one asked.
 */
function applyAccountFilters(graph: MentionConnections, requested: Array<string>) {
  const accounts = graph.targets
    .flatMap((target) => (target.kind === "account" ? [target] : []))
    .toSorted((left, right) => left.username.localeCompare(right.username));
  const idByUsername = new Map(accounts.map(({ username, id }) => [username, id]));
  const unknownAccounts = [...new Set(requested)].filter((username) => !idByUsername.has(username));
  const selectedIds = new Set(
    unknownAccounts.length > 0
      ? []
      : requested.flatMap((username) => idByUsername.get(username) ?? []),
  );
  return {
    accounts: accounts.map(({ pk, username }) => ({
      username,
      avatarPath: media.image.avatar(pk).url,
    })),
    selectedAccounts: accounts.flatMap(({ id, username }) =>
      selectedIds.has(id) ? [username] : [],
    ),
    unknownAccounts,
    graph: selectedIds.size === 0 ? graph : keepNeighborhoods(graph, selectedIds),
  };
}

/** `source` and `target` only name the two ends: who mentioned whom is in the source stories. */
export function loadMentionGraph(runtime: MentionGraphRuntime, accountFilters: Array<string> = []) {
  const { graph, ...filters } = applyAccountFilters(
    readMentionConnections(runtime),
    accountFilters,
  );
  const points = graph.targets.map(toGraphPoint);
  const labelById = new Map(points.map(({ id, label }) => [id, label]));
  const connections = graph.connections.map(
    ({ id, targetIds: [source, target], observations }) => ({
      id,
      source,
      target,
      labels: [labelById.get(source) ?? source, labelById.get(target) ?? target] as const,
      storyPks: observations.map(({ storyPk }) => storyPk),
    }),
  );
  const sources = runtime.stories.listTimelineStories([
    ...new Set(connections.flatMap(({ storyPks }) => storyPks)),
  ]);
  const sidebarUsers = loadSidebarUsers(runtime);
  return {
    ...filters,
    points,
    connections,
    stories: [...Map.groupBy(sources, ({ owner_pk }) => owner_pk).values()].flatMap((owned) =>
      createOwnerStoryCards(runtime, owned, sidebarUsers),
    ),
  };
}

export type MentionGraphPageData = ReturnType<typeof loadMentionGraph>;
