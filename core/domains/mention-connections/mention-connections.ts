import type { InstagramUserEntry } from "@@/core/domains/database/entities/instagram-user.ts";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";

export interface MentionConnectionsRuntime {
  stories: Pick<StoryRepository, "listMentionOccurrences">;
  users: Pick<InstagramUserRepository, "listAll">;
}

type MentionOccurrence = ReturnType<StoryRepository["listMentionOccurrences"]>[number];

type AccountId = `account:${string}`;
type UsernameId = `username:${string}`;
type NameId = `name:${string}`;
type MentionTargetId = AccountId | UsernameId | NameId;

/** A story's author, or the only current Account whose username a sticker names. */
interface AccountTarget {
  kind: "account";
  id: AccountId;
  label: string;
  pk: string;
  username: string;
  fullName: string | null;
}

/** Every sticker naming the same username, ignoring case, names this one target. */
interface UsernameTarget {
  id: UsernameId;
  label: string;
  username: string;
}

interface UnknownUsernameTarget extends UsernameTarget {
  kind: "unknown-username";
}

/**
 * Stickers keep a label, not an account id, so when several current Accounts share the username
 * none of them is assumed to be the person mentioned.
 */
interface AmbiguousUsernameTarget extends UsernameTarget {
  kind: "ambiguous-username";
  accountPks: Array<string>;
}

/** Equal full names do not prove identity, so each story's name stays its own target. */
interface NameTarget {
  kind: "name";
  id: NameId;
  label: string;
  storyPk: string;
}

export type MentionTarget =
  | AccountTarget
  | UnknownUsernameTarget
  | AmbiguousUsernameTarget
  | NameTarget;

interface MentionObservation {
  storyPk: string;
  takenAt: number | null;
  authorId: AccountId;
  mentionedId: MentionTargetId;
}

interface MentionConnection {
  id: string;
  /** Sorted, so their order says nothing of who mentioned whom: the observations do. */
  targetIds: [MentionTargetId, MentionTargetId];
  /** One per source story, however many stickers it carries for the pair. */
  observations: Array<MentionObservation>;
}

/** Both newest source story first, as the occurrences are read. */
export interface MentionConnections {
  targets: Array<MentionTarget>;
  connections: Array<MentionConnection>;
}

function toAccountTarget(
  account: Pick<InstagramUserEntry, "pk" | "username" | "full_name">,
): AccountTarget {
  return {
    kind: "account",
    id: `account:${account.pk}`,
    label: `@${account.username}`,
    pk: account.pk,
    username: account.username,
    fullName: account.full_name,
  };
}

function toConnectionTargetIds(
  a: MentionTargetId,
  b: MentionTargetId,
): [MentionTargetId, MentionTargetId] {
  return a < b ? [a, b] : [b, a];
}

function createMentionTargetResolver(accounts: Array<InstagramUserEntry>) {
  const accountsByUsername = Map.groupBy(accounts, ({ username }) => username.toLowerCase());

  return function resolveMentionTarget({ label, storyPk }: MentionOccurrence): MentionTarget {
    if (!label.startsWith("@")) {
      return {
        kind: "name",
        id: `name:${storyPk}:${encodeURIComponent(label.toLowerCase())}`,
        label,
        storyPk,
      };
    }
    const username = label.slice(1).toLowerCase();
    const matches = accountsByUsername.get(username) ?? [];
    if (matches.length === 1) {
      return toAccountTarget(matches[0]);
    }
    const target: UsernameTarget = { id: `username:${username}`, label: `@${username}`, username };
    return matches.length === 0
      ? { kind: "unknown-username", ...target }
      : { kind: "ambiguous-username", ...target, accountPks: matches.map(({ pk }) => pk) };
  };
}

function namesAuthor(target: MentionTarget, author: AccountTarget): boolean {
  return (
    target.id === author.id ||
    (target.kind === "ambiguous-username" && target.accountPks.includes(author.pk))
  );
}

/**
 * Stickers naming the author, and people two stickers of a story name together, make no
 * connection.
 */
export function readMentionConnections(runtime: MentionConnectionsRuntime): MentionConnections {
  const resolveMentionTarget = createMentionTargetResolver(runtime.users.listAll());
  const targets = new Map<MentionTargetId, MentionTarget>();
  const connections = new Map<string, MentionConnection>();

  for (const occurrence of runtime.stories.listMentionOccurrences()) {
    const author = toAccountTarget(occurrence.author);
    const mentioned = resolveMentionTarget(occurrence);
    if (namesAuthor(mentioned, author)) {
      continue;
    }
    for (const target of [author, mentioned]) {
      if (!targets.has(target.id)) {
        targets.set(target.id, target);
      }
    }
    const targetIds = toConnectionTargetIds(author.id, mentioned.id);
    const id = targetIds.join(" ");
    const connection = connections.get(id) ?? { id, targetIds, observations: [] };
    connections.set(id, connection);
    if (!connection.observations.some(({ storyPk }) => storyPk === occurrence.storyPk)) {
      connection.observations.push({
        storyPk: occurrence.storyPk,
        takenAt: occurrence.takenAt,
        authorId: author.id,
        mentionedId: mentioned.id,
      });
    }
  }

  return { targets: [...targets.values()], connections: [...connections.values()] };
}

/** The union of the Neighborhoods of `selectedIds`, in their original order. */
function keepNeighborhoods(
  { targets, connections }: MentionConnections,
  selectedIds: ReadonlySet<string>,
): MentionConnections {
  const kept = new Set(selectedIds);
  for (const {
    targetIds: [first, second],
  } of connections) {
    if (selectedIds.has(first)) {
      kept.add(second);
    }
    if (selectedIds.has(second)) {
      kept.add(first);
    }
  }
  return {
    targets: targets.filter(({ id }) => kept.has(id)),
    connections: connections.filter(({ targetIds }) => targetIds.every((id) => kept.has(id))),
  };
}

/**
 * A username several drawn Accounts share selects all of them, since nothing tells which one is
 * meant. One username no drawn Account has skips every filter, so a shared link never shows a
 * partial graph as the one asked for.
 */
export function filterByAccounts(graph: MentionConnections, usernames: Array<string>) {
  const accounts = graph.targets.flatMap((target) => (target.kind === "account" ? [target] : []));
  const accountsByUsername = Map.groupBy(accounts, ({ username }) => username);
  const requested = [...new Set(usernames)];
  const unknownUsernames = requested.filter((username) => !accountsByUsername.has(username));
  const selectedUsernames = unknownUsernames.length > 0 ? [] : requested;
  const selectedIds = new Set(
    selectedUsernames.flatMap((username) =>
      (accountsByUsername.get(username) ?? []).map(({ id }) => id),
    ),
  );
  return {
    accounts,
    selectedUsernames,
    unknownUsernames,
    graph: selectedIds.size === 0 ? graph : keepNeighborhoods(graph, selectedIds),
  };
}
