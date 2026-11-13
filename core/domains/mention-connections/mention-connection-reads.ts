import { z } from "zod";
import { normalizeSearchQuery, rankTextMatch } from "@@/core/utils/search-text.ts";
import {
  findMentionPoints,
  fullNameOf,
  readMentionConnections,
  type MentionConnection,
  type MentionConnections,
  type MentionConnectionsRuntime,
  type MentionPoint,
} from "./mention-connections.ts";

/** How many connections or people a page holds. */
const PAGE_SIZE = 10;
/** How many source stories a read of one connection gives at a time. */
const STORY_PAGE_SIZE = 5;
/** How many neighbors a found person names. */
const NEIGHBOR_COUNT = 5;

/** Someone at one end of a Mention connection, as the Assistant reads them. */
type MentionPerson =
  | { kind: "account"; id: string; label: string; fullName: string | null }
  | { kind: "unknown-username"; id: string; label: string }
  | { kind: "ambiguous-username"; id: string; label: string; accounts: Array<string> }
  | { kind: "name"; id: string; label: string };

const MentionPersonSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("account"),
    id: z.string(),
    label: z.string(),
    fullName: z.string().nullable(),
  }),
  z.object({ kind: z.literal("unknown-username"), id: z.string(), label: z.string() }),
  z.object({
    kind: z.literal("ambiguous-username"),
    id: z.string(),
    label: z.string(),
    accounts: z.array(z.string()),
  }),
  z.object({ kind: z.literal("name"), id: z.string(), label: z.string() }),
]) satisfies z.ZodType<MentionPerson>;

/** A person and what the stored mentions observed of them. */
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

/** How many source stories show one person mentioning the other. */
interface MentionDirection {
  author: string;
  mentioned: string;
  storyCount: number;
}

const MentionDirectionSchema = z.object({
  author: z.string(),
  mentioned: z.string(),
  storyCount: z.number(),
}) satisfies z.ZodType<MentionDirection>;

/** A Mention connection as a list of connections gives it. */
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

/** The input of a page: the offset of the page, the first one when left out. */
export const MentionOffsetSchema = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('The "nextOffset" of the previous page, to read the next one. Leave it out first.');

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
    stories: z.array(
      z.object({
        storyPk: z.string(),
        date: z.string().nullable(),
        author: z.string(),
        mentioned: z.string(),
      }),
    ),
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

function nextOffsetAfter(offset: number, size: number, total: number): number | null {
  return offset + size < total ? offset + size : null;
}

function otherOf({ pointIds: [first, second] }: MentionConnection, id: string): string {
  return first === id ? second : first;
}

/** The stored Mention connections, with what the Assistant needs to describe their people. */
function createMentionReader(runtime: MentionConnectionsRuntime) {
  const graph: MentionConnections = readMentionConnections(runtime);
  const usernames = new Map(runtime.users.listAll().map(({ pk, username }) => [pk, username]));
  const labels = new Map(graph.points.map(({ id, label }) => [id, label]));

  function describePerson(point: MentionPoint): MentionPerson {
    const { id, label } = point;
    if (point.kind === "account") {
      return { kind: point.kind, id, label, fullName: point.fullName };
    }
    if (point.kind === "ambiguous-username") {
      return {
        kind: point.kind,
        id,
        label,
        accounts: point.accountPks.flatMap((pk) => {
          const username = usernames.get(pk);
          return username === undefined ? [] : [`@${username}`];
        }),
      };
    }
    return { kind: point.kind, id, label };
  }

  function connectionsOf(id: string): Array<MentionConnection> {
    return graph.connections.filter(({ pointIds }) => pointIds.includes(id));
  }

  function summarizePerson(point: MentionPoint): MentionPersonSummary {
    const connections = connectionsOf(point.id);
    return {
      person: describePerson(point),
      connectionCount: connections.length,
      storyCount: new Set(
        connections.flatMap(({ observations }) => observations.map(({ storyPk }) => storyPk)),
      ).size,
      latestStoryDate: formatDate(latestTakenAt(connections)),
      connectedTo: connections
        .slice(0, NEIGHBOR_COUNT)
        .map((connection) => labels.get(otherOf(connection, point.id)) ?? ""),
    };
  }

  function describeMentions({ observations }: MentionConnection): Array<MentionDirection> {
    const directions = Map.groupBy(
      observations,
      ({ authorId, mentionedId }) => `${authorId} ${mentionedId}`,
    );
    return [...directions.values()].map((stories) => ({
      author: labels.get(stories[0].authorId) ?? "",
      mentioned: labels.get(stories[0].mentionedId) ?? "",
      storyCount: stories.length,
    }));
  }

  /** The person a query names, or why there is not exactly one. */
  function findPerson(
    query: string,
  ):
    | { status: "found"; point: MentionPoint }
    | { status: "unknown" }
    | ({ status: "ambiguous" } & AmbiguousMentionQuery) {
    const points = findMentionPoints(runtime, graph, query);
    if (points.length === 0) {
      return { status: "unknown" };
    }
    if (points.length === 1) {
      return { status: "found", point: points[0] };
    }
    return {
      status: "ambiguous",
      query,
      candidates: points.slice(0, PAGE_SIZE).map(summarizePerson),
      total: points.length,
    };
  }

  return { graph, describePerson, describeMentions, connectionsOf, findPerson, summarizePerson };
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
  if (found?.status === "unknown") {
    return { status: "unknown_person", query: person ?? "" };
  }
  if (found?.status === "ambiguous") {
    const { status: _status, ...ambiguous } = found;
    return { status: "ambiguous", ...ambiguous };
  }
  const point = found?.point;
  const connections =
    point === undefined ? reader.graph.connections : reader.connectionsOf(point.id);
  const pointsById = new Map(reader.graph.points.map((each) => [each.id, each]));
  return {
    status: "listed",
    person: point === undefined ? null : reader.describePerson(point),
    connections: connections.slice(offset, offset + PAGE_SIZE).flatMap((connection) => {
      const ids =
        point === undefined || connection.pointIds[0] === point.id
          ? connection.pointIds
          : connection.pointIds.toReversed();
      const [first, second] = ids.map((id) => pointsById.get(id));
      if (first === undefined || second === undefined) {
        return [];
      }
      return [
        {
          people: [reader.describePerson(first), reader.describePerson(second)],
          storyCount: connection.observations.length,
          latestStoryDate: formatDate(latestTakenAt([connection])),
          mentions: reader.describeMentions(connection),
        },
      ];
    }),
    total: connections.length,
    nextOffset: nextOffsetAfter(offset, PAGE_SIZE, connections.length),
  };
}

/**
 * A page of the people of the Mention connections whose username or full name contains the
 * query, ignoring case, accents and a leading `@`: exact matches first, then prefixes, then the
 * others, each the person of the latest source story first. Equal names from different stories
 * are different people.
 */
export function searchMentionConnections(
  runtime: MentionConnectionsRuntime,
  { query, offset = 0 }: { query: string; offset?: number },
): MentionPeoplePage {
  const reader = createMentionReader(runtime);
  const wanted = normalizeSearchQuery(query);
  const matches =
    wanted === ""
      ? []
      : reader.graph.points.flatMap((point) => {
          const ranks = [point.label, fullNameOf(point)].flatMap((text) => {
            const rank = text === null ? null : rankTextMatch(text.replace(/^@/u, ""), wanted);
            return rank === null ? [] : [rank];
          });
          return ranks.length === 0 ? [] : [{ point, rank: Math.min(...ranks) }];
        });
  return {
    people: matches
      .toSorted((left, right) => left.rank - right.rank)
      .slice(offset, offset + PAGE_SIZE)
      .map(({ point }) => reader.summarizePerson(point)),
    total: matches.length,
    nextOffset: nextOffsetAfter(offset, PAGE_SIZE, matches.length),
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
  const unknown = queries.filter((_, index) => found[index].status === "unknown");
  if (unknown.length > 0) {
    return { status: "unknown_person", queries: unknown };
  }
  const ambiguous = found.flatMap((each) => {
    if (each.status !== "ambiguous") {
      return [];
    }
    const { status: _status, ...match } = each;
    return [match];
  });
  if (ambiguous.length > 0) {
    return { status: "ambiguous", matches: ambiguous };
  }
  const [first, second] = found.flatMap((each) => (each.status === "found" ? [each.point] : []));
  const people: [MentionPerson, MentionPerson] = [
    reader.describePerson(first),
    reader.describePerson(second),
  ];
  const connection = reader
    .connectionsOf(first.id)
    .find(({ pointIds }) => pointIds.includes(second.id) && first.id !== second.id);
  if (connection === undefined) {
    return { status: "no_observation", people };
  }
  const labels = new Map([first, second].map(({ id, label }) => [id, label]));
  return {
    status: "found",
    people,
    storyCount: connection.observations.length,
    mentions: reader.describeMentions(connection),
    stories: connection.observations
      .slice(offset, offset + STORY_PAGE_SIZE)
      .map(({ storyPk, takenAt, authorId, mentionedId }) => ({
        storyPk,
        date: formatDate(takenAt),
        author: labels.get(authorId) ?? "",
        mentioned: labels.get(mentionedId) ?? "",
      })),
    nextOffset: nextOffsetAfter(offset, STORY_PAGE_SIZE, connection.observations.length),
  };
}
