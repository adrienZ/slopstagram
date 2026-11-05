import type { SidebarUser } from "../loaders/sidebar-users.ts";

/**
 * The link schemes the Assistant may write in its markdown, each rendered by a component of the
 * chat: `place:<place id>` and `user:<username>`. A model only picks from this list.
 */
const linkSchemes = ["place", "user"] as const;

export type LinkScheme = (typeof linkSchemes)[number];

/** A markdown link target of a known scheme: the scheme and the id its component resolves. */
export interface LinkTarget {
  scheme: LinkScheme;
  id: string;
}

const mentionPattern = /(?<![\w/:.@])@(?<username>\w+(?:\.\w+)*)/gu;

/** The link target `scheme:id`, as the Assistant writes it in a markdown link. */
export function buildLinkTarget(scheme: LinkScheme, id: string): string {
  return `${scheme}:${id}`;
}

/** Reads a markdown link target of a known scheme, or `undefined` for any other target. */
export function parseLinkTarget(url: string): LinkTarget | undefined {
  const separator = url.indexOf(":");
  if (separator === -1) {
    return undefined;
  }
  const name = url.slice(0, separator);
  const id = url.slice(separator + 1);
  const scheme = linkSchemes.find((candidate) => candidate === name);
  return scheme === undefined || id === "" ? undefined : { scheme, id };
}

/**
 * Passes the targets of the known schemes through and sends every other target to the renderer's
 * default transform, which drops the unsafe ones.
 */
export function transformLinkTarget(
  url: string,
  defaultTransform: (url: string) => string | null | undefined,
): string | null | undefined {
  return parseLinkTarget(url) === undefined ? defaultTransform(url) : url;
}

/**
 * Writes each `@username` of an account as a `user:` link, which the chat shows as a sticker. A
 * name that is not an account stays plain text.
 */
export function linkMentions(text: string, accounts: Array<SidebarUser>): string {
  return text.replaceAll(mentionPattern, (mention, username: string) => {
    const account = accounts.find(
      (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
    );
    return account === undefined
      ? mention
      : `[${mention}](${buildLinkTarget("user", account.username)})`;
  });
}
