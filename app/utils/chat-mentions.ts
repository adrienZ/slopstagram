import type { SidebarUser } from "../loaders/sidebar-users.ts";

const MAX_SUGGESTIONS = 5;
const ACTIVE_MENTION = /(?:^|\s)@(?<query>[\w.]*)$/u;

export interface ActiveMention {
  query: string;
  /** Index of the `@` that opens the mention. */
  start: number;
}

/** The mention being typed right before the caret, if any. */
export function findActiveMention(text: string, caret: number): ActiveMention | null {
  const query = ACTIVE_MENTION.exec(text.slice(0, caret))?.groups?.query;
  return query === undefined ? null : { query, start: caret - query.length - 1 };
}

export function suggestMentions(
  users: Array<SidebarUser>,
  mention: ActiveMention | null,
): Array<SidebarUser> {
  if (mention === null) {
    return [];
  }
  const query = mention.query.toLowerCase();
  return users
    .filter(({ username }) => username.toLowerCase().includes(query))
    .slice(0, MAX_SUGGESTIONS);
}

export interface CompletedMention {
  caret: number;
  text: string;
}

/** Replaces the mention being typed with the full handle, followed by a space. */
export function completeMention(
  text: string,
  caret: number,
  mention: ActiveMention,
  username: string,
): CompletedMention {
  const completed = `${text.slice(0, mention.start)}@${username} `;
  return { caret: completed.length, text: `${completed}${text.slice(caret)}` };
}
