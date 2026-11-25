import { useTranslation } from "react-i18next";
import type {
  AmbiguousMentionQuery,
  MentionConnectionList,
  MentionConnectionRead,
  MentionDirection,
  MentionPeoplePage,
} from "@@/core/domains/mention-connections/mention-connection-reads.ts";
import { formatStoryCount } from "../utils/helper.ts";
import { formatStickerStoryDate } from "../utils/timeline-stickers.ts";

function formatMention({ author, mentioned, storyCount }: MentionDirection): string {
  return `${author} → ${mentioned} (${formatStoryCount(storyCount)})`;
}

function AmbiguousCandidates({ query, candidates, total }: AmbiguousMentionQuery) {
  const { t } = useTranslation();

  return (
    <section aria-label={t("mentions.ambiguousLabel", { query })} className="tw:grid tw:gap-1">
      <p>{t("mentions.ambiguous", { total, query })}</p>
      <ul className="tw:grid tw:gap-1">
        {candidates.map(({ person, connectedTo }) => (
          <li key={person.id}>
            {person.label}
            {connectedTo.length > 0 &&
              ` · ${t("mentions.connectedWith", { names: connectedTo.join(", ") })}`}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Mention connections the Assistant listed, as plain text. */
export function MentionConnectionSummaries({ list }: { list: MentionConnectionList }) {
  const { t } = useTranslation();

  if (list.status === "unknown_person") {
    return <p>{t("mentions.unknownPerson", { names: list.query })}</p>;
  }

  if (list.status === "ambiguous") {
    return <AmbiguousCandidates {...list} />;
  }

  if (list.connections.length === 0) {
    return <p>{t("mentions.noConnections")}</p>;
  }

  return (
    <>
      <ul aria-label={t("mentions.connectionsLabel")} className="tw:grid tw:gap-1">
        {list.connections.map(({ people: [first, second], mentions }) => (
          <li key={`${first.id} ${second.id}`}>
            {first.label} – {second.label} · {mentions.map(formatMention).join(", ")}
          </li>
        ))}
      </ul>
      {list.total > list.connections.length && (
        <p>{t("mentions.connectionsOf", { shown: list.connections.length, total: list.total })}</p>
      )}
    </>
  );
}

/** The people of the Mention connections the Assistant found, as plain text. */
export function MentionPeople({ page }: { page: MentionPeoplePage }) {
  const { t } = useTranslation();

  if (page.people.length === 0) {
    return <p>{t("mentions.noPeople")}</p>;
  }

  return (
    <>
      <ul aria-label={t("mentions.peopleLabel")} className="tw:grid tw:gap-1">
        {page.people.map(({ person, connectionCount, storyCount }) => (
          <li key={person.id}>
            {person.label} · {t("mentions.connectionCount", { count: connectionCount })} ·{" "}
            {formatStoryCount(storyCount)}
          </li>
        ))}
      </ul>
      {page.total > page.people.length && (
        <p>{t("mentions.peopleOf", { shown: page.people.length, total: page.total })}</p>
      )}
    </>
  );
}

/** The Mention connection the Assistant read, as plain text: who mentioned whom, and where. */
export function MentionConnectionDetails({ read }: { read: MentionConnectionRead }) {
  const { t } = useTranslation();

  if (read.status === "unknown_person") {
    return <p>{t("mentions.unknownPerson", { names: read.queries.join(", ") })}</p>;
  }

  if (read.status === "ambiguous") {
    return read.matches.map((match) => <AmbiguousCandidates key={match.query} {...match} />);
  }

  const [first, second] = read.people;

  if (read.status === "no_observation") {
    return <p>{t("mentions.noObservation", { first: first.label, second: second.label })}</p>;
  }

  return (
    <section aria-label={t("mentions.readLabel")} className="tw:grid tw:gap-1">
      <p className="tw:font-medium">{read.mentions.map(formatMention).join(", ")}</p>
      <ul aria-label={t("mentions.sourceStories")} className="tw:grid tw:gap-1">
        {read.stories.map((story) => (
          <li key={story.storyPk}>
            {story.date !== null && (
              <>
                <time dateTime={story.date}>{formatStickerStoryDate(story.date)}</time> ·{" "}
              </>
            )}
            {story.author} → {story.mentioned}
          </li>
        ))}
      </ul>
      {read.nextOffset !== null && <p>{t("assistant.storiesTotal", { count: read.storyCount })}</p>}
    </section>
  );
}
