import "@tanstack/react-start/server-only";
import {
  readMentionConnections,
  type MentionConnectionsRuntime,
} from "@@/core/domains/mention-connections/mention-connections.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import type { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import { createOwnerStoryCards } from "./account-timeline.ts";
import { loadSidebarUsers } from "./sidebar-users.ts";

interface MentionGraphRuntime extends MentionConnectionsRuntime {
  stories: Pick<StoryRepository, "listMentionOccurrences" | "listByUsername">;
  appleVision: Pick<AppleVisionRepository, "findByMediaPk">;
  vision: Pick<VisionRepository, "findByMediaPk">;
}

export function loadMentionGraph(runtime: MentionGraphRuntime) {
  const graph = readMentionConnections(runtime);
  const evidence = graph.connections.flatMap((connection) => connection.evidence);
  const storyIds = new Set(evidence.map(({ storyId }) => storyId));
  const authors = new Set(evidence.map(({ authorId }) => authorId));
  const users = loadSidebarUsers(runtime);
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      avatarPath: node.kind === "account" ? `/media/avatars/${node.accountPk}.jpg` : undefined,
    })),
    connections: graph.connections.map(({ evidence: sources, ...connection }) => ({
      ...connection,
      storyIds: sources.map(({ storyId }) => storyId),
    })),
    stories: graph.nodes.flatMap((node) =>
      node.kind === "account" && authors.has(node.id)
        ? createOwnerStoryCards(
            runtime,
            runtime.stories
              .listByUsername(node.username)
              .filter(
                ({ owner_pk, story }) => owner_pk === node.accountPk && storyIds.has(story.pk),
              ),
            users,
          )
        : [],
    ),
  };
}

export type MentionGraphPageData = ReturnType<typeof loadMentionGraph>;
