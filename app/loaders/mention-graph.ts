import "@tanstack/react-start/server-only";
import {
  readMentionConnections,
  type MentionConnectionsRuntime,
} from "@@/core/domains/mention-connections/mention-connections.ts";

export function loadMentionGraph(runtime: MentionConnectionsRuntime) {
  const graph = readMentionConnections(runtime);
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      avatarPath: node.kind === "account" ? `/media/avatars/${node.accountPk}.jpg` : undefined,
    })),
    connections: graph.connections.map(({ evidence: _evidence, ...connection }) => connection),
  };
}

export type MentionGraphPageData = ReturnType<typeof loadMentionGraph>;
