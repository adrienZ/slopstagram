import { z } from "zod";
import { pageOf } from "@@/core/utils/paging.ts";
import { normalizeSearchQuery, rankTextMatch } from "@@/core/utils/search-text.ts";
import {
  findMentionTargets,
  readMentionConnections,
  type MentionConnection,
  type MentionConnections,
  type MentionConnectionsRuntime,
  type MentionTarget,
} from "./mention-connections.ts";

const PAGE_SIZE = 10;
const STORY_PAGE_SIZE = 5;
const CONNECTED_TO_LIMIT = 5;

type MentionPerson =
  | {
      kind: "account" | "unknown-username" | "name";
      id: string;
      label: string;
      fullName: string | null;
    }
  | { kind: "ambiguous-username"; id: string; label: string; accounts: Array<string> };

const MentionPersonSchema = z.union([
  z.object({
    kind: z.enum(["account", "unknown-username", "name"]),
    id: z.string(),
    label: z.string(),
    fullName: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("ambiguous-username"),
    id: z.string(),
    label: z.string(),
    accounts: z.array(z.string()),
  }),
]) satisfies z.ZodType<MentionPerson>;

export interface MentionPersonSummary {
  person: MentionPerson;
  connectionCount: number;
  /** Their distinct source stories, over every connection. */
  storyCount: number;
  /** ISO date of their latest source story, null when none or undated. */
  latestStoryDate: string | null;
  /** The labels of whom they are connected to, the latest first, a few at most. */
  connectedTo: Array<string>;
}

const MentionPersonSummarySchema = z.object({
  person: MentionPersonSchema,
  connectionCount: z.number(),
  storyCount: z.number(),
  latestStoryDate: z.string().nullable(),
  connectedTo: z.array(z.string()),
}) satisfies z.ZodType<MentionPersonSummary>;

export interface MentionDirection {
  author: string;
  mentioned: string;
  storyCount: number;
}

const MentionDirectionSchema = z.object({
  author: z.string(),
  mentioned: z.string(),
  storyCount: z.number(),
}) satisfies z.ZodType<MentionDirection>;

export interface MentionConnectionSummary {
  people: [MentionPerson, MentionPerson];
  storyCount: number;
  latestStoryDate: string | null;
  /** Who mentioned whom, in how many stories, the latest first. */
  mentions: Array<MentionDirection>;
}

const MentionConnectionSummarySchema = z.object({
  people: z.tuple([MentionPersonSchema, MentionPersonSchema]),
  storyCount: z.number(),
  latestStoryDate: z.string().nullable(),
  mentions: z.array(MentionDirectionSchema),
}) satisfies z.ZodType<MentionConnectionSummary>;

/** A query that names several people: none of them is picked. */
export interface AmbiguousMentionQuery {
  query: string;
  /** A few of them at most. */
  candidates: Array<MentionPersonSummary>;
  total: number;
}

const AmbiguousMentionQuerySchema = z.object({
  query: z.string(),
  candidates: z.array(MentionPersonSummarySchema),
  total: z.number(),
}) satisfies z.ZodType<AmbiguousMentionQuery>;

/** Stickers keep a username, not an account id, so a sticker naming an Account is a guess. */
export const MENTION_PERSON_KINDS_DESCRIPTION = `Kinds: "account" is a saved Account; when a sticker names it, it is the Account that has this username today, which may not be whom the story meant. "unknown-username" is a username no Account has, "ambiguous-username" a username several Accounts share ("accounts"), "name" a full name one story's sticker carries.`;

export type MentionConnectionList =
  | {
      status: "listed";
      /** The person whose connections these are, or null for everyone's. */
      person: MentionPerson | null;
      connections: Array<MentionConnectionSummary>;
      total: number;
      nextOffset: number | null;
    }
  | { status: "unknown_person"; query: string }
  | ({ status: "ambiguous" } & AmbiguousMentionQuery);

export const MentionConnectionListSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("listed"),
    person: MentionPersonSchema.nullable(),
    connections: z.array(MentionConnectionSummarySchema),
    total: z.number(),
    nextOffset: z.number().nullable(),
  }),
  z.object({ status: z.literal("unknown_person"), query: z.string() }),
  AmbiguousMentionQuerySchema.extend({ status: z.literal("ambiguous") }),
]) satisfies z.ZodType<MentionConnectionList>;

export interface MentionPeoplePage {
  people: Array<MentionPersonSummary>;
  total: number;
  nextOffset: number | null;
}

export const MentionPeoplePageSchema = z.object({
  people: z.array(MentionPersonSummarySchema),
  total: z.number(),
  nextOffset: z.number().nullable(),
}) satisfies z.ZodType<MentionPeoplePage>;

/** One source story of a connection: its author mentioned the other person on it. */
interface MentionStory {
  storyPk: string;
  date: string | null;
  author: string;
  mentioned: string;
}

const MentionStorySchema = z.object({
  storyPk: z.string(),
  date: z.string().nullable(),
  author: z.string(),
  mentioned: z.string(),
}) satisfies z.ZodType<MentionStory>;

export type MentionConnectionRead =
  | {
      status: "found";
      /** In the order asked. */
      people: [MentionPerson, MentionPerson];
      storyCount: number;
      mentions: Array<MentionDirection>;
      /** One page of the source stories, the latest first. */
      stories: Array<MentionStory>;
      nextOffset: number | null;
    }
  | { status: "no_observation"; people: [MentionPerson, MentionPerson] }
  | { status: "unknown_person"; queries: Array<string> }
  | { status: "ambiguous"; matches: Array<AmbiguousMentionQuery> };

export const MentionConnectionReadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    people: z.tuple([MentionPersonSchema, MentionPersonSchema]),
    storyCount: z.number(),
    mentions: z.array(MentionDirectionSchema),
    stories: z.array(MentionStorySchema),
    nextOffset: z.number().nullable(),
  }),
  z.object({
    status: z.literal("no_observation"),
    people: z.tuple([MentionPersonSchema, MentionPersonSchema]),
  }),
  z.object({ status: z.literal("unknown_person"), queries: z.array(z.string()) }),
  z.object({ status: z.literal("ambiguous"), matches: z.array(AmbiguousMentionQuerySchema) }),
]) satisfies z.ZodType<MentionConnectionRead>;

function formatDate(takenAt: number | null): string | null {
  return takenAt === null ? null : new Date(takenAt * 1000).toISOString();
}

function latestTakenAt(connections: Array<MentionConnection>): number | null {
  const dates = connections.flatMap(({ observations }) =>
    observations.flatMap(({ takenAt }) => (takenAt === null ? [] : [takenAt])),
  );
  return dates.length === 0 ? null : Math.max(...dates);
}

function otherOf(
  { targetIds: [first, second] }: MentionConnection,
  id: MentionTarget["id"],
): MentionTarget["id"] {
  return first === id ? second : first;
}

function describePerson(target: MentionTarget): MentionPerson {
  const { id, label } = target;
  if (target.kind === "ambiguous-username") {
    return { kind: target.kind, id, label, accounts: target.accounts.map((each) => each.label) };
  }
  return { kind: target.kind, id, label, fullName: target.fullName };
}

function createMentionReader(runtime: MentionConnectionsRuntime) {
  const graph: MentionConnections = readMentionConnections(runtime);
  const targetsById = new Map(graph.targets.map((target) => [target.id, target]));

  /** Every end of a connection is one of the graph's targets, so a missing one is a bug. */
  function targetOf(id: MentionTarget["id"]): MentionTarget {
    const target = targetsById.get(id);
    if (target === undefined) {
      throw new Error(`No Mention target ${id} in the Mention connections`);
    }
    return target;
  }

  function labelOf(id: MentionTarget["id"]): string {
    return targetOf(id).label;
  }

  function connectionsOf(id: MentionTarget["id"]): Array<MentionConnection> {
    return graph.connections.filter(({ targetIds }) => targetIds.includes(id));
  }

  function summarizePerson(target: MentionTarget): MentionPersonSummary {
    const connections = connectionsOf(target.id);
    return {
      person: describePerson(target),
      connectionCount: connections.length,
      storyCount: new Set(
        connections.flatMap(({ observations }) => observations.map(({ storyPk }) => storyPk)),
      ).size,
      latestStoryDate: formatDate(latestTakenAt(connections)),
      connectedTo: connections
        .slice(0, CONNECTED_TO_LIMIT)
        .map((connection) => labelOf(otherOf(connection, target.id))),
    };
  }

  function describeMentions({ observations }: MentionConnection): Array<MentionDirection> {
    const directions = Map.groupBy(
      observations,
      ({ authorId, mentionedId }) => `${authorId} ${mentionedId}`,
    );
    return [...directions.values()].map((stories) => ({
      author: labelOf(stories[0].authorId),
      mentioned: labelOf(stories[0].mentionedId),
      storyCount: stories.length,
    }));
  }

  function findPerson(
    query: string,
  ):
    | { status: "found"; target: MentionTarget }
    | { status: "unknown_person"; query: string }
    | { status: "ambiguous"; match: AmbiguousMentionQuery } {
    const targets = findMentionTargets(graph, query);
    if (targets.length === 0) {
      return { status: "unknown_person", query };
    }
    if (targets.length === 1) {
      return { status: "found", target: targets[0] };
    }
    return {
      status: "ambiguous",
      match: {
        query,
        candidates: targets.slice(0, PAGE_SIZE).map(summarizePerson),
        total: targets.length,
      },
    };
  }

  return {
    graph,
    describeMentions,
    connectionsOf,
    findPerson,
    labelOf,
    summarizePerson,
    targetOf,
  };
}

/**
 * A page of the Mention connections over every stored story, of one person or everyone's, the
 * connection of the latest source story first.
 */
export function listMentionConnections(
  runtime: MentionConnectionsRuntime,
  { person, offset = 0 }: { person?: string; offset?: number } = {},
): MentionConnectionList {
  const reader = createMentionReader(runtime);
  const found = person === undefined ? undefined : reader.findPerson(person);
  if (found?.status === "unknown_person") {
    return found;
  }
  if (found?.status === "ambiguous") {
    return { status: "ambiguous", ...found.match };
  }
  const target = found?.target;
  const connections =
    target === undefined ? reader.graph.connections : reader.connectionsOf(target.id);
  const page = pageOf(connections, offset, PAGE_SIZE);
  return {
    status: "listed",
    person: target === undefined ? null : describePerson(target),
    connections: page.items.map((connection) => {
      const [first, second] =
        target === undefined || connection.targetIds[0] === target.id
          ? connection.targetIds
          : connection.targetIds.toReversed();
      return {
        people: [describePerson(reader.targetOf(first)), describePerson(reader.targetOf(second))],
        storyCount: connection.observations.length,
        latestStoryDate: formatDate(latestTakenAt([connection])),
        mentions: reader.describeMentions(connection),
      };
    }),
    total: page.total,
    nextOffset: page.nextOffset,
  };
}

/**
 * A page of the people of the Mention connections whose username or full name contains the
 * query, ignoring case, accents and a leading `@`: exact matches first, then prefixes, then the
 * others, each the person of the latest source story first. Equal names from different stories
 * are different people.
 */
export function searchMentionPeople(
  runtime: MentionConnectionsRuntime,
  { query, offset = 0 }: { query: string; offset?: number },
): MentionPeoplePage {
  const reader = createMentionReader(runtime);
  const wanted = normalizeSearchQuery(query);
  const matches =
    wanted === ""
      ? []
      : reader.graph.targets.flatMap((target) => {
          const ranks = [target.label, target.fullName].flatMap((text) => {
            const rank = text === null ? null : rankTextMatch(text.replace(/^@/u, ""), wanted);
            return rank === null ? [] : [rank];
          });
          return ranks.length === 0 ? [] : [{ target, rank: Math.min(...ranks) }];
        });
  const page = pageOf(
    matches.toSorted((left, right) => left.rank - right.rank),
    offset,
    PAGE_SIZE,
  );
  return {
    people: page.items.map(({ target }) => reader.summarizePerson(target)),
    total: page.total,
    nextOffset: page.nextOffset,
  };
}

/**
 * The Mention connection between two people, whoever mentioned whom, with one page of its source
 * stories, the latest first.
 */
export function getMentionConnection(
  runtime: MentionConnectionsRuntime,
  {
    firstPerson,
    secondPerson,
    offset = 0,
  }: { firstPerson: string; secondPerson: string; offset?: number },
): MentionConnectionRead {
  const reader = createMentionReader(runtime);
  const queries = [firstPerson, secondPerson];
  const found = queries.map((query) => reader.findPerson(query));
  const unknown = queries.filter((_, index) => found[index].status === "unknown_person");
  if (unknown.length > 0) {
    return { status: "unknown_person", queries: unknown };
  }
  const ambiguous = found.flatMap((each) => (each.status === "ambiguous" ? [each.match] : []));
  if (ambiguous.length > 0) {
    return { status: "ambiguous", matches: ambiguous };
  }
  const [first, second] = found.flatMap((each) => (each.status === "found" ? [each.target] : []));
  const people: [MentionPerson, MentionPerson] = [describePerson(first), describePerson(second)];
  const connection = reader
    .connectionsOf(first.id)
    .find(({ targetIds }) => targetIds.includes(second.id) && first.id !== second.id);
  if (connection === undefined) {
    return { status: "no_observation", people };
  }
  const page = pageOf(connection.observations, offset, STORY_PAGE_SIZE);
  return {
    status: "found",
    people,
    storyCount: page.total,
    mentions: reader.describeMentions(connection),
    stories: page.items.map(({ storyPk, takenAt, authorId, mentionedId }) => ({
      storyPk,
      date: formatDate(takenAt),
      author: reader.labelOf(authorId),
      mentioned: reader.labelOf(mentionedId),
    })),
    nextOffset: page.nextOffset,
  };
}
