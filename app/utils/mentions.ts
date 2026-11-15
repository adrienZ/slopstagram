/** An `@username` that starts a word. A username never ends with a period. */
const MENTION = /(?<![\w@])@(?<username>[\w.]*\w)/gu;

interface Mention {
  index: number;
  text: string;
  username: string;
}

export function findMentions(text: string): Array<Mention> {
  return [...text.matchAll(MENTION)].map((match) => ({
    index: match.index,
    text: match[0],
    username: match.groups?.username ?? "",
  }));
}
