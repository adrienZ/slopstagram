import type {
  AmbiguousMentionQuery,
  MentionConnectionList,
  MentionConnectionRead,
  MentionPeoplePage,
} from "@@/core/domains/mention-connections/mention-connection-reads.ts";
import { formatStickerStoryDate } from "../utils/timeline-stickers.ts";

function formatStoryCount(count: number): string {
  return `${count} ${count > 1 ? "stories" : "story"}`;
}

function formatMention({
  author,
  mentioned,
  storyCount,
}: {
  author: string;
  mentioned: string;
  storyCount: number;
}): string {
  return `${author} → ${mentioned} (${formatStoryCount(storyCount)})`;
}

function AmbiguousCandidates({ query, candidates, total }: AmbiguousMentionQuery) {
  return (
    <section aria-label={`Personnes nommées ${query}`} className="tw:grid tw:gap-1">
      <p>
        {total} personnes s’appellent {query}.
      </p>
      <ul className="tw:grid tw:gap-1">
        {candidates.map(({ person, connectedTo }) => (
          <li key={person.id}>
            {person.label}
            {connectedTo.length > 0 && ` · avec ${connectedTo.join(", ")}`}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Mention connections the Assistant listed, as plain text. */
export function MentionConnectionSummaries({ list }: { list: MentionConnectionList }) {
  if (list.status === "unknown_person") {
    return <p>Personne ne s’appelle {list.query} dans les mentions.</p>;
  }
  if (list.status === "ambiguous") {
    return <AmbiguousCandidates {...list} />;
  }
  if (list.connections.length === 0) {
    return <p>Aucune connexion de mention.</p>;
  }
  return (
    <>
      <ul aria-label="Connexions de mention" className="tw:grid tw:gap-1">
        {list.connections.map(({ people: [first, second], mentions }) => (
          <li key={`${first.id} ${second.id}`}>
            {first.label} – {second.label} · {mentions.map(formatMention).join(", ")}
          </li>
        ))}
      </ul>
      {list.total > list.connections.length && (
        <p>
          {list.connections.length} connexions sur {list.total}.
        </p>
      )}
    </>
  );
}

/** The people of the Mention connections the Assistant found, as plain text. */
export function MentionPeople({ page }: { page: MentionPeoplePage }) {
  if (page.people.length === 0) {
    return <p>Aucune personne trouvée.</p>;
  }
  return (
    <>
      <ul aria-label="Personnes trouvées" className="tw:grid tw:gap-1">
        {page.people.map(({ person, connectionCount, storyCount }) => (
          <li key={person.id}>
            {person.label} · {connectionCount} connexion{connectionCount > 1 ? "s" : ""} ·{" "}
            {formatStoryCount(storyCount)}
          </li>
        ))}
      </ul>
      {page.total > page.people.length && (
        <p>
          {page.people.length} personnes sur {page.total}.
        </p>
      )}
    </>
  );
}

/** The Mention connection the Assistant read, as plain text: who mentioned whom, and where. */
export function MentionConnectionDetails({ read }: { read: MentionConnectionRead }) {
  if (read.status === "unknown_person") {
    return <p>Personne ne s’appelle {read.queries.join(", ")} dans les mentions.</p>;
  }
  if (read.status === "ambiguous") {
    return read.matches.map((match) => <AmbiguousCandidates key={match.query} {...match} />);
  }
  const [first, second] = read.people;
  if (read.status === "no_observation") {
    return (
      <p>
        Aucune story de {first.label} ne mentionne {second.label}, ni l’inverse.
      </p>
    );
  }
  return (
    <section aria-label="Connexion de mention lue" className="tw:grid tw:gap-1">
      <p className="tw:font-medium">{read.mentions.map(formatMention).join(", ")}</p>
      <ul aria-label="Stories sources" className="tw:grid tw:gap-1">
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
      {read.nextOffset !== null && <p>{formatStoryCount(read.storyCount)} au total.</p>}
    </section>
  );
}
