import type { InstagramUserEntry } from "@@/core/domains/database/entities/instagram-user.ts";
import type { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import type {
  MentionOccurrence,
  StoryRepository,
} from "@@/core/domains/database/repositories/story-repository.ts";

/** What reading the Mention connections needs. */
export interface MentionConnectionsRuntime {
  stories: Pick<StoryRepository, "listMentionOccurrences">;
  users: Pick<InstagramUserRepository, "listAll">;
}

/** A known Account: a story's author, or the one current Account whose username a sticker names. */
interface AccountPoint {
  kind: "account";
  /** `account:<pk>`. */
  id: string;
  /** `@username`. */
  label: string;
  pk: string;
  username: string;
  fullName: string | null;
}

/** A username no current Account has, one point for every sticker naming it, ignoring case. */
interface UnknownUsernamePoint {
  kind: "unknown-username";
  /** `username:<lowercase username>`. */
  id: string;
  /** `@username`, lowercase. */
  label: string;
  username: string;
}

/**
 * A username several current Accounts share, ignoring case. Stickers keep a label, not an
 * account id, so none of those Accounts is assumed to be the person mentioned.
 */
interface AmbiguousUsernamePoint {
  kind: "ambiguous-username";
  /** `username:<lowercase username>`. */
  id: string;
  /** `@username`, lowercase. */
  label: string;
  username: string;
  /** The Accounts whose username matches, none of them merged into this point. */
  accountPks: Array<string>;
}

/** A full name a sticker carries without a username: equal names on other stories stay apart. */
interface NamePoint {
  kind: "name";
  /** `name:<story pk>:<encoded lowercase name>`. */
  id: string;
  /** The full name as the sticker spells it. */
  label: string;
  storyPk: string;
}

/** Someone at one end of a Mention connection. */
export type MentionPoint = AccountPoint | UnknownUsernamePoint | AmbiguousUsernamePoint | NamePoint;

/** One source story of a Mention connection, with who mentioned whom. */
interface MentionObservation {
  storyPk: string;
  takenAt: number | null;
  /** The point of the story's author, always an Account. */
  authorId: string;
  mentionedId: string;
}

/** The Mention connection of one pair of points, whichever of them mentioned the other. */
interface MentionConnection {
  /** The two point ids, sorted, joined by a space. */
  id: string;
  /** Sorted, so their order says nothing of who mentioned whom: the observations do. */
  pointIds: [string, string];
  /** One per source story, however many stickers it carries for the pair, newest first. */
  observations: Array<MentionObservation>;
}

export interface MentionConnections {
  /** Only the points with a connection, in the order of their newest source story. */
  points: Array<MentionPoint>;
  /** In the order of their newest source story. */
  connections: Array<MentionConnection>;
}

function toAccountPoint(account: InstagramUserEntry): AccountPoint {
  return {
    kind: "account",
    id: `account:${account.pk}`,
    label: `@${account.username}`,
    pk: account.pk,
    username: account.username,
    fullName: account.full_name,
  };
}

function createMentionResolver(accounts: Array<InstagramUserEntry>) {
  const accountsByUsername = Map.groupBy(accounts, ({ username }) => username.toLowerCase());

  return function resolveMentioned({ label, storyPk }: MentionOccurrence): MentionPoint {
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
      return toAccountPoint(matches[0]);
    }
    const id = `username:${username}`;
    return matches.length === 0
      ? { kind: "unknown-username", id, label: `@${username}`, username }
      : {
          kind: "ambiguous-username",
          id,
          label: `@${username}`,
          username,
          accountPks: matches.map(({ pk }) => pk),
        };
  };
}

/**
 * The Mention connections of every stored story: from the story's author to whom each of its
 * mention stickers names. Stickers naming the author, and people two stickers of a story name
 * together, make no connection. A connection is an observation, not proof that two people know
 * each other, and it lasts only as long as one of its source stories is stored.
 */
export function readMentionConnections(runtime: MentionConnectionsRuntime): MentionConnections {
  const accounts = runtime.users.listAll();
  const authors = new Map(accounts.map((account) => [account.pk, toAccountPoint(account)]));
  const resolveMentioned = createMentionResolver(accounts);
  const points = new Map<string, MentionPoint>();
  const connections = new Map<string, MentionConnection>();

  for (const occurrence of runtime.stories.listMentionOccurrences()) {
    const author = authors.get(occurrence.authorPk);
    const mentioned = resolveMentioned(occurrence);
    if (author === undefined || mentioned.id === author.id) {
      continue;
    }
    for (const point of [author, mentioned]) {
      if (!points.has(point.id)) {
        points.set(point.id, point);
      }
    }
    const pointIds: [string, string] =
      author.id < mentioned.id ? [author.id, mentioned.id] : [mentioned.id, author.id];
    const id = pointIds.join(" ");
    const connection = connections.get(id) ?? { id, pointIds, observations: [] };
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

  return { points: [...points.values()], connections: [...connections.values()] };
}

/**
 * The neighborhoods of the given points: each of them, the points it shares a connection with,
 * and every connection between two of those points, so neighbors' own connections show too.
 * Points and connections keep their order.
 */
export function keepNeighborhoods(
  { points, connections }: MentionConnections,
  centerIds: ReadonlySet<string>,
): MentionConnections {
  const kept = new Set(centerIds);
  for (const {
    pointIds: [first, second],
  } of connections) {
    if (centerIds.has(first)) {
      kept.add(second);
    }
    if (centerIds.has(second)) {
      kept.add(first);
    }
  }
  return {
    points: points.filter(({ id }) => kept.has(id)),
    connections: connections.filter(({ pointIds }) => pointIds.every((id) => kept.has(id))),
  };
}
