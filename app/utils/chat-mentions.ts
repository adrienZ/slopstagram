import type { SidebarUser } from "../loaders/sidebar-users.ts";

const MAX_SUGGESTIONS = 8;
/** An `@` that starts a word, followed by the username typed so far, right before the caret. */
const TYPED_MENTION = /(?<![\w@])@(?<query>[\w.]*)$/u;
/** The rest of the username after the caret, replaced too when a suggestion is picked. */
const USERNAME_TAIL = /^[\w.]*/u;
/** An `@username` that starts a word. A username never ends with a period. */
const MENTION = /(?<![\w@])@(?<username>[\w.]*\w)/gu;

/** The Mention being typed right before the caret. */
export interface TypedMention {
  query: string;
  /** Index of the `@` that opens the Mention. */
  start: number;
}

/** The Mention being typed right before the caret, if any. */
export function findTypedMention(text: string, caret: number): TypedMention | null {
  const query = TYPED_MENTION.exec(text.slice(0, caret))?.groups?.query;
  return query === undefined ? null : { query, start: caret - query.length - 1 };
}

/** The saved accounts matching a typed Mention, those starting with it first. */
export function suggestAccounts(
  accounts: Array<SidebarUser>,
  mention: TypedMention | null,
): Array<SidebarUser> {
  if (mention === null) {
    return [];
  }
  const query = mention.query.toLowerCase();
  const matching = accounts.filter(({ username }) => username.toLowerCase().includes(query));
  return [
    ...matching.filter(({ username }) => username.toLowerCase().startsWith(query)),
    ...matching.filter(({ username }) => !username.toLowerCase().startsWith(query)),
  ].slice(0, MAX_SUGGESTIONS);
}

/** A message once a suggestion was picked, with the caret right after the inserted Mention. */
export interface InsertedMention {
  caret: number;
  text: string;
}

/** Replaces the typed Mention with `@username` and a space, and puts the caret after them. */
export function insertMention(
  text: string,
  caret: number,
  mention: TypedMention,
  username: string,
): InsertedMention {
  const tail = USERNAME_TAIL.exec(text.slice(caret))?.[0] ?? "";
  const inserted = `${text.slice(0, mention.start)}@${username} `;
  const rest = text.slice(caret + tail.length).replace(/^ /u, "");
  return { caret: inserted.length, text: `${inserted}${rest}` };
}

export type MentionSegment =
  | { text: string; type: "text" }
  /** A Mention of a saved account: `text` is spelled as written. */
  | { account: SidebarUser; text: string; type: "mention" };

/** Splits a message into plain text and the Mentions of saved accounts, ignoring letter case. */
export function splitMentions(text: string, accounts: Array<SidebarUser>): Array<MentionSegment> {
  const segments: Array<MentionSegment> = [];
  let end = 0;
  for (const match of text.matchAll(MENTION)) {
    const wanted = (match.groups?.username ?? "").toLowerCase();
    const account = accounts.find(({ username }) => username.toLowerCase() === wanted);
    if (account === undefined) {
      continue;
    }
    if (match.index > end) {
      segments.push({ text: text.slice(end, match.index), type: "text" });
    }
    segments.push({ account, text: match[0], type: "mention" });
    end = match.index + match[0].length;
  }
  if (end < text.length) {
    segments.push({ text: text.slice(end), type: "text" });
  }
  return segments;
}
