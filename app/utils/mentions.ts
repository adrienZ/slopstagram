/** An `@username` that starts a word. A username never ends with a period. */
const MENTION = /(?<![\w@])@(?<username>[\w.]*\w)/gu;

/** An `@username` written in a message. */
interface Mention {
  /** Index of the `@`. */
  index: number;
  /** The Mention as written, `@` included. */
  text: string;
  username: string;
}

/** The Mentions of a message, in order and as written, whether or not the account is saved. */
export function findMentions(text: string): Array<Mention> {
  return [...text.matchAll(MENTION)].map((match) => ({
    index: match.index,
    text: match[0],
    username: match.groups?.username ?? "",
  }));
}
