import type { InstagramUserEntry } from "@@/core/domains/database/entities/instagram-user.ts";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import { normalizeSearchQuery } from "@@/core/utils/search-text.ts";

export interface MentionConnectionsRuntime {
  stories: Pick<StoryRepository, "listMentionOccurrences">;
  users: Pick<InstagramUserRepository, "listAll">;
}

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
  fullName: null;
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
  accounts: Array<AccountTarget>;
}

/** Equal full names do not prove identity, so each story's name stays its own target. */
interface NameTarget {
  kind: "name";
  id: NameId;
  label: string;
  fullName: string;
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

export interface MentionConnection {
  id: string;
  /** Sorted, so their order says nothing of who mentioned whom: the observations do. */
  targetIds: [MentionTargetId, MentionTargetId];
  /** One per source story, however many stickers it carries for the pair. */
  observations: Array<MentionObservation>;
}

export interface MentionConnections {
  /** Every current Account, connected or not, which a query may name. */
  accounts: Array<AccountTarget>;
  /** Both newest source story first, as the occurrences are read. */
  targets: Array<MentionTarget>;
  connections: Array<MentionConnection>;
}

function toAccountTarget({
  pk,
  username,
  fullName,
}: Pick<AccountTarget, "pk" | "username" | "fullName">): AccountTarget {
  return { kind: "account", id: `account:${pk}`, label: `@${username}`, pk, username, fullName };
}

function toAccountTargets(accounts: Array<InstagramUserEntry>): Array<AccountTarget> {
  return accounts.map(({ pk, username, full_name: fullName }) =>
    toAccountTarget({ pk, username, fullName }),
  );
}

function toConnectionTargetIds(
  a: MentionTargetId,
  b: MentionTargetId,
): [MentionTargetId, MentionTargetId] {
  return a < b ? [a, b] : [b, a];
}

/** Accounts by username ignoring case, the way a sticker's username names them. */
function groupByUsername(accounts: Array<AccountTarget>): Map<string, Array<AccountTarget>> {
  return Map.groupBy(accounts, ({ username }) => username.toLowerCase());
}

function createUsernameResolver(accounts: Array<AccountTarget>) {
  const accountsByUsername = groupByUsername(accounts);

  return function resolveUsername(
    caseInsensitiveUsername: string,
  ): AccountTarget | UnknownUsernameTarget | AmbiguousUsernameTarget {
    const username = caseInsensitiveUsername.toLowerCase();
    const matches = accountsByUsername.get(username) ?? [];
    if (matches.length === 1) {
      return matches[0];
    }
    const target: UsernameTarget = {
      id: `username:${username}`,
      label: `@${username}`,
      username,
      fullName: null,
    };
    return matches.length === 0
      ? { kind: "unknown-username", ...target }
      : { kind: "ambiguous-username", ...target, accounts: matches };
  };
}

function toNameTarget(label: string, storyPk: string): NameTarget {
  return {
    kind: "name",
    id: `name:${storyPk}:${encodeURIComponent(label.toLowerCase())}`,
    label,
    fullName: label,
    storyPk,
  };
}

function namesAuthor(target: MentionTarget, author: AccountTarget): boolean {
  return (
    target.id === author.id ||
    (target.kind === "ambiguous-username" && target.accounts.some(({ id }) => id === author.id))
  );
}

/**
 * Stickers naming the author, and people two stickers of a story name together, make no
 * connection.
 */
export function readMentionConnections(runtime: MentionConnectionsRuntime): MentionConnections {
  const accounts = toAccountTargets(runtime.users.listAll());
  const resolveUsername = createUsernameResolver(accounts);
  const targets = new Map<MentionTargetId, MentionTarget>();
  const connections = new Map<string, MentionConnection>();

  for (const occurrence of runtime.stories.listMentionOccurrences()) {
    const author = toAccountTarget(occurrence.author);
    const mentioned = occurrence.label.startsWith("@")
      ? resolveUsername(occurrence.label.slice(1))
      : toNameTarget(occurrence.label, occurrence.storyPk);
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

  return { accounts, targets: [...targets.values()], connections: [...connections.values()] };
}

/** The union of the Neighborhoods of `selectedIds`, in their original order. */
function keepNeighborhoods(
  { accounts, targets, connections }: MentionConnections,
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
    accounts,
    targets: targets.filter(({ id }) => kept.has(id)),
    connections: connections.filter(({ targetIds }) => targetIds.every((id) => kept.has(id))),
  };
}

/** A username of the drawn Accounts, ignoring case, and the Accounts it names. */
export interface DrawnUsername {
  username: string;
  accounts: Array<AccountTarget>;
}

/**
 * Ignoring case, as stickers name Accounts: a username several drawn Accounts share names all of
 * them, since nothing tells which one is meant.
 */
function listDrawnUsernames(targets: Array<MentionTarget>): Array<DrawnUsername> {
  const accounts = targets.flatMap((target) => (target.kind === "account" ? [target] : []));
  return [...groupByUsername(accounts)].map(([username, shared]) => ({
    username: shared.length === 1 ? shared[0].username : username,
    accounts: shared,
  }));
}

/**
 * Usernames are matched ignoring case. One username no drawn Account has skips every filter, so a
 * shared link never shows a partial graph as the one asked for.
 */
export function filterByAccounts(graph: MentionConnections, usernames: Array<string>) {
  const drawnUsernames = listDrawnUsernames(graph.targets);
  const drawnByUsername = new Map(
    drawnUsernames.map((drawn) => [drawn.username.toLowerCase(), drawn]),
  );
  const requested = [...new Set(usernames)];
  const unknownUsernames = requested.filter(
    (username) => !drawnByUsername.has(username.toLowerCase()),
  );
  const selected =
    unknownUsernames.length > 0
      ? []
      : [
          ...new Set(
            requested.flatMap((username) => drawnByUsername.get(username.toLowerCase()) ?? []),
          ),
        ];
  const selectedIds = new Set(selected.flatMap(({ accounts }) => accounts.map(({ id }) => id)));
  return {
    drawnUsernames,
    selectedUsernames: selected.map(({ username }) => username),
    unknownUsernames,
    graph: selectedIds.size === 0 ? graph : keepNeighborhoods(graph, selectedIds),
  };
}

/**
 * Whom a target id, a username or a full name names, by the rules a mention sticker follows: a
 * username, with or without `@` and ignoring case, names its one Account, or the username itself
 * when no Account has it, as long as a sticker has it. A username several Accounts share names
 * each of them and the stickers naming it, since nothing tells which one is meant. Otherwise
 * every Account and name-only observation with exactly this full name, ignoring case and accents,
 * so equal names on different stories come back apart. Empty when nothing matches.
 */
export function findMentionTargets(
  { accounts, targets }: Pick<MentionConnections, "accounts" | "targets">,
  query: string,
): Array<MentionTarget> {
  const wanted = query.trim();
  const target = [...targets, ...accounts].find(({ id }) => id === wanted);
  if (target !== undefined) {
    return [target];
  }
  const named = createUsernameResolver(accounts)(wanted.replace(/^@/u, ""));
  if (named.kind === "account") {
    return [named];
  }
  if (named.kind === "ambiguous-username") {
    return [...targets.filter(({ id }) => id === named.id), ...named.accounts];
  }
  if (targets.some(({ id }) => id === named.id)) {
    return [named];
  }
  const name = normalizeSearchQuery(wanted);
  if (name === "") {
    return [];
  }
  return [...targets.filter(({ kind }) => kind === "name"), ...accounts].filter(
    ({ fullName }) => fullName !== null && normalizeSearchQuery(fullName) === name,
  );
}
