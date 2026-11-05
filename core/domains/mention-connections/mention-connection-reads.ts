import { z } from "zod";
import { normalizeSearchQuery, rankTextMatch } from "@@/core/utils/search-text.ts";
import {
  readMentionConnections,
  readMentionAccounts,
  type MentionConnection,
  type MentionConnectionsRuntime,
  type MentionNode,
} from "./mention-connections.ts";

const PAGE_SIZE = 10;

export const MentionOffsetSchema = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    "The previous result's nextOffset to read the next page. Leave it out for the first page.",
  );

export const MentionPersonSchema = z.object({
  id: z.string(),
  kind: z.enum(["account", "username", "name", "ambiguous"]),
  label: z.string(),
  username: z.string().nullable(),
  fullName: z.string().nullable(),
  candidateAccountIds: z.array(z.string()),
  candidateAccountCount: z.number(),
});

const ConnectionSummarySchema = z.object({
  source: MentionPersonSchema,
  target: MentionPersonSchema,
  storyCount: z.number(),
});

export const MentionConnectionListSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("listed"),
    connections: z.array(ConnectionSummarySchema),
    total: z.number(),
    nextOffset: z.number().nullable(),
  }),
  z.object({ status: z.literal("unknown_person"), personId: z.string() }),
]);

function describePerson(node: MentionNode): z.infer<typeof MentionPersonSchema> {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    username: node.username,
    fullName: node.kind === "account" ? node.fullName : null,
    candidateAccountIds:
      node.kind === "account" ? [] : node.candidateAccountIds.slice(0, PAGE_SIZE),
    candidateAccountCount: node.kind === "account" ? 0 : node.candidateAccountIds.length,
  };
}

function latestObservation(connection: MentionConnection): number | null {
  let latest: number | null = null;
  for (const { takenAt } of connection.evidence) {
    if (takenAt !== null) {
      latest = latest === null ? takenAt : Math.max(latest, takenAt);
    }
  }
  return latest;
}

/** Retained mention pairs, newest observation first. A person id includes unknown observations. */
export function listMentionConnections(
  runtime: MentionConnectionsRuntime,
  { personId, offset = 0 }: { personId?: string; offset?: number } = {},
): z.infer<typeof MentionConnectionListSchema> {
  const graph = readMentionConnections(runtime);
  const people = new Map(
    [...readMentionAccounts(runtime), ...graph.nodes].map((node) => [
      node.id,
      describePerson(node),
    ]),
  );
  if (personId !== undefined && !people.has(personId)) {
    return { status: "unknown_person", personId };
  }
  const connections = graph.connections
    .filter(
      ({ source, target }) => personId === undefined || source === personId || target === personId,
    )
    .toSorted(
      (left, right) =>
        (latestObservation(right) ?? 0) - (latestObservation(left) ?? 0) ||
        left.id.localeCompare(right.id),
    );
  const end = offset + PAGE_SIZE;
  return {
    status: "listed",
    connections: connections.slice(offset, end).flatMap((connection) => {
      const source = people.get(connection.source);
      const target = people.get(connection.target);
      return source && target ? [{ source, target, storyCount: connection.storyCount }] : [];
    }),
    total: connections.length,
    nextOffset: end < connections.length ? end : null,
  };
}

const SearchPersonSchema = MentionPersonSchema.extend({
  connectionCount: z.number(),
  latestStoryDate: z.string().nullable(),
});

export const MentionConnectionSearchSchema = z.object({
  people: z.array(SearchPersonSchema),
  total: z.number(),
  nextOffset: z.number().nullable(),
  requiresClarification: z.boolean(),
});

function observationDate(takenAt: number | null): string | null {
  return takenAt === null ? null : new Date(takenAt * 1000).toISOString();
}

/** Searches identities rather than merging equal labels, including saved isolated accounts. */
export function searchMentionConnections(
  runtime: MentionConnectionsRuntime,
  { query, offset = 0 }: { query: string; offset?: number },
): z.infer<typeof MentionConnectionSearchSchema> {
  const graph = readMentionConnections(runtime);
  const people = new Map(
    [...readMentionAccounts(runtime), ...graph.nodes].map((node) => [node.id, node]),
  );
  const wanted = normalizeSearchQuery(query);
  const matches =
    wanted.length === 0
      ? []
      : [...people.values()]
          .flatMap((person) => {
            const labels = [
              person.label.replace(/^@/u, ""),
              person.username,
              person.kind === "account" ? person.fullName : null,
            ];
            const ranks = labels.flatMap((label) => {
              const rank = label === null ? null : rankTextMatch(label, wanted);
              return rank === null ? [] : [rank];
            });
            return ranks.length === 0 ? [] : [{ person, rank: Math.min(...ranks) }];
          })
          .toSorted(
            (left, right) =>
              left.rank - right.rank || left.person.id.localeCompare(right.person.id),
          );
  const end = offset + PAGE_SIZE;
  return {
    people: matches.slice(offset, end).map(({ person }) => {
      const connections = graph.connections.filter(
        ({ source, target }) => source === person.id || target === person.id,
      );
      const dates = connections.flatMap((connection) => latestObservation(connection) ?? []);
      const latest = dates.length === 0 ? null : Math.max(...dates);
      return {
        ...describePerson(person),
        connectionCount: connections.length,
        latestStoryDate: observationDate(latest),
      };
    }),
    total: matches.length,
    nextOffset: end < matches.length ? end : null,
    requiresClarification:
      matches.length > 1 || matches.some(({ person }) => person.kind === "ambiguous"),
  };
}

const ConnectionEvidenceSchema = z.object({
  storyId: z.string(),
  date: z.string().nullable(),
  author: MentionPersonSchema,
  target: MentionPersonSchema,
});

export const MentionConnectionReadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    personalRelationship: z.literal("unknown"),
    interpretation: z.string(),
    connection: ConnectionSummarySchema,
    evidence: z.array(ConnectionEvidenceSchema),
    nextOffset: z.number().nullable(),
  }),
  z.object({
    status: z.literal("no_observation"),
    personalRelationship: z.literal("unknown"),
    interpretation: z.string(),
    source: MentionPersonSchema,
    target: MentionPersonSchema,
  }),
  z.object({
    status: z.literal("unknown_person"),
    personalRelationship: z.literal("unknown"),
    interpretation: z.string(),
    personIds: z.array(z.string()),
  }),
  z.object({
    status: z.literal("ambiguous"),
    personalRelationship: z.literal("unknown"),
    interpretation: z.string(),
    matches: z.array(
      z.object({ query: z.string(), people: z.array(MentionPersonSchema), total: z.number() }),
    ),
  }),
]);

/** One observed pair and a bounded page of stories, preserving who mentioned whom. */
export function getMentionConnection(
  runtime: MentionConnectionsRuntime,
  { sourceId, targetId, offset = 0 }: { sourceId: string; targetId: string; offset?: number },
): z.infer<typeof MentionConnectionReadSchema> {
  const graph = readMentionConnections(runtime);
  const people = new Map(
    [...readMentionAccounts(runtime), ...graph.nodes].map((node) => [
      node.id,
      describePerson(node),
    ]),
  );
  const selectors = [sourceId, targetId].map((query) => {
    const exact = people.get(query);
    const wanted = normalizeSearchQuery(query);
    const matches = exact
      ? [exact]
      : [...people.values()].filter((person) =>
          (query.trim().startsWith("@")
            ? [person.username]
            : [person.username, person.fullName, person.label]
          ).some((label) => label !== null && normalizeSearchQuery(label) === wanted),
        );
    return { query, people: matches, total: matches.length };
  });
  const ambiguous = selectors.filter(({ total }) => total > 1);
  if (ambiguous.length > 0) {
    return {
      status: "ambiguous",
      personalRelationship: "unknown",
      interpretation:
        "Several distinct identities or story observations match. Ask the user which candidate they mean before choosing.",
      matches: ambiguous.map((match) => ({
        ...match,
        people: match.people
          .toSorted((left, right) => left.id.localeCompare(right.id))
          .slice(0, PAGE_SIZE),
      })),
    };
  }
  const [source, target] = selectors.map((selector) => selector.people.at(0));
  if (!source || !target) {
    return {
      status: "unknown_person",
      personalRelationship: "unknown",
      interpretation:
        "No matching identity is available in retained data. Whether these people know each other remains unknown.",
      personIds: selectors.filter(({ total }) => total === 0).map(({ query }) => query),
    };
  }
  const connection = graph.connections.find(
    (pair) =>
      (pair.source === source.id && pair.target === target.id) ||
      (pair.source === target.id && pair.target === source.id),
  );
  if (!connection) {
    return {
      status: "no_observation",
      personalRelationship: "unknown",
      interpretation:
        "No retained mention connects these people. This does not prove they do not know each other; personal acquaintance remains unknown.",
      source,
      target,
    };
  }
  const end = offset + 5;
  return {
    status: "found",
    personalRelationship: "unknown",
    interpretation:
      "Observed mentions exist. They do not establish whether these people know each other; personal acquaintance remains unknown.",
    connection: { source, target, storyCount: connection.storyCount },
    evidence: connection.evidence
      .toSorted(
        (left, right) =>
          (right.takenAt ?? 0) - (left.takenAt ?? 0) || left.storyId.localeCompare(right.storyId),
      )
      .slice(offset, end)
      .flatMap((observation) => {
        const author = people.get(observation.authorId);
        const mentioned = people.get(observation.targetId);
        return author && mentioned
          ? [
              {
                storyId: observation.storyId,
                date: observationDate(observation.takenAt),
                author,
                target: mentioned,
              },
            ]
          : [];
      }),
    nextOffset: end < connection.storyCount ? end : null,
  };
}
