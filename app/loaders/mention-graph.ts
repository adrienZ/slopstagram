import "@tanstack/react-start/server-only";
import type { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import { media } from "@@/core/domains/media-store/media-urls.ts";
import {
  filterByAccounts,
  readMentionConnections,
  type MentionConnectionsRuntime,
  type MentionTarget,
} from "@@/core/domains/mention-connections/mention-connections.ts";
import { keepAccountFilters } from "../utils/account-filter-search.ts";
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

/** A username several drawn Accounts share has no avatar: one would picture only one of them. */
function toFilterOptions(drawnUsernames: ReturnType<typeof filterByAccounts>["drawnUsernames"]) {
  return drawnUsernames
    .toSorted((left, right) => left.username.localeCompare(right.username))
    .map(({ username, accounts: [first, ...others] }) => ({
      username,
      avatarPath: others.length === 0 ? media.image.avatar(first.pk).url : undefined,
    }));
}

/** `source` and `target` only name the two ends: who mentioned whom is in the source stories. */
export function loadMentionGraph(runtime: MentionGraphRuntime, accountFilters: Array<string>) {
  const { drawnUsernames, selectedUsernames, unknownUsernames, graph } = filterByAccounts(
    readMentionConnections(runtime, runtime.users.listAll()),
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
  const accountOptions = toFilterOptions(drawnUsernames);
  return {
    accounts: accountOptions,
    selectedAccounts: keepAccountFilters(accountOptions, selectedUsernames),
    unknownAccounts: unknownUsernames,
    graph: {
      points,
      connections,
      stories: [...Map.groupBy(sources, ({ owner_pk }) => owner_pk).values()].flatMap((owned) =>
        createOwnerStoryCards(runtime, owned, sidebarUsers),
      ),
    },
  };
}

export type MentionGraphPageData = ReturnType<typeof loadMentionGraph>;
