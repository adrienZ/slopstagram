import type { InstagramUserRepository } from "../database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "../database/repositories/story-repository.ts";

export interface MentionConnectionsRuntime {
  stories: Pick<StoryRepository, "listMentionOccurrences">;
  users: Pick<InstagramUserRepository, "listAll">;
}

export interface AccountMentionNode {
  kind: "account";
  id: string;
  label: string;
  accountPk: string;
  username: string;
  fullName: string | null;
}

export interface UnknownMentionNode {
  kind: "username" | "name" | "ambiguous";
  id: string;
  label: string;
  username: string | null;
  /** Multiple current accounts have this username; none is assumed to be the person mentioned. */
  candidateAccountIds: Array<string>;
}

export type MentionNode = AccountMentionNode | UnknownMentionNode;

export interface MentionEvidence {
  storyId: string;
  takenAt: number | null;
  authorId: string;
  targetId: string;
}

export interface MentionConnection {
  id: string;
  source: string;
  target: string;
  storyCount: number;
  evidence: Array<MentionEvidence>;
}

/** Current retained observations, not proof of personal acquaintance or permanent identity. */
export function readMentionConnections(runtime: MentionConnectionsRuntime) {
  const accounts = runtime.users.listAll();
  const byUsername = Map.groupBy(accounts, ({ username }) => username.toLowerCase());
  const nodes = new Map<string, MentionNode>();
  const accountNodes = new Map(
    accounts.map((account) => {
      const node: AccountMentionNode = {
        id: `account:${account.pk}`,
        kind: "account",
        label: `@${account.username}`,
        accountPk: account.pk,
        username: account.username,
        fullName: account.full_name,
      };
      return [account.pk, node];
    }),
  );
  const connections = new Map<string, MentionConnection>();
  for (const occurrence of runtime.stories.listMentionOccurrences()) {
    const author = accountNodes.get(occurrence.authorPk);
    const label = occurrence.label.trim();
    if (!author || label.length === 0) {
      continue;
    }
    let target: MentionNode;
    if (label.startsWith("@")) {
      const username = label.slice(1).toLowerCase();
      if (username.length === 0) {
        continue;
      }
      const candidates = byUsername.get(username) ?? [];
      const [candidate] = candidates;
      const match = candidates.length === 1 ? accountNodes.get(candidate.pk) : undefined;
      target = match ?? {
        id: `username:${username}`,
        kind: candidates.length > 1 ? "ambiguous" : "username",
        label,
        username,
        candidateAccountIds: candidates.map(({ pk }) => `account:${pk}`),
      };
    } else {
      target = {
        id: `name:${occurrence.storyId}:${encodeURIComponent(label)}`,
        kind: "name",
        label,
        username: null,
        candidateAccountIds: [],
      };
    }
    if (target.id === author.id) {
      continue;
    }
    nodes.set(author.id, author);
    // Preserve the first (newest) label when unknown usernames differ only in case.
    if (!nodes.has(target.id)) {
      nodes.set(target.id, target);
    }
    const [source, destination] = [author.id, target.id].toSorted();
    const id = JSON.stringify([source, destination]);
    let connection = connections.get(id);
    if (!connection) {
      connection = { id, source, target: destination, storyCount: 0, evidence: [] };
      connections.set(id, connection);
    }
    if (!connection.evidence.some(({ storyId }) => storyId === occurrence.storyId)) {
      connection.evidence.push({
        storyId: occurrence.storyId,
        takenAt: occurrence.takenAt,
        authorId: author.id,
        targetId: target.id,
      });
      connection.storyCount += 1;
    }
  }
  return { nodes: [...nodes.values()], connections: [...connections.values()] };
}
