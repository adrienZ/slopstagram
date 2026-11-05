import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { formatUserHandle } from "../utils/helper.ts";
import { presentSticker } from "../utils/sticker-presentation.ts";
import { Sticker } from "./sticker.tsx";

const mentionPattern = /(?<![\w/:.@])@(?<username>\w+(?:\.\w+)*)/gu;
const profilePath = "/users/";

/** Writes each `@username` of a text as a link to the profile, which the chat shows as a sticker. */
function linkMentions(text: string): string {
  return text.replaceAll(
    mentionPattern,
    (mention, username: string) => `[${mention}](${profilePath}${username})`,
  );
}

function createComponents(accounts: Array<SidebarUser>): Components {
  return {
    a: ({ children, href }) =>
      href?.startsWith(profilePath) === true ? (
        <Sticker
          sticker={presentSticker(
            "mention",
            formatUserHandle(href.slice(profilePath.length)),
            accounts,
          )}
        />
      ) : (
        <a href={href} className="tw:underline" target="_blank" rel="noreferrer">
          {children}
        </a>
      ),
    p: ({ children }) => <p className="tw:leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="tw:list-disc tw:space-y-1 tw:pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="tw:list-decimal tw:space-y-1 tw:pl-5">{children}</ol>,
    strong: ({ children }) => <strong className="tw:font-semibold">{children}</strong>,
  };
}

/**
 * The Assistant's text, which the model writes as markdown, with its mentions as the stickers of
 * the story feed. Raw HTML in it is not rendered, and unsafe link targets are dropped by the
 * renderer.
 */
export function ChatMarkdown({
  accounts,
  children,
}: {
  accounts: Array<SidebarUser>;
  children: string;
}) {
  const components = useMemo(() => createComponents(accounts), [accounts]);
  return (
    <div className="tw:grid tw:gap-3">
      <ReactMarkdown components={components}>{linkMentions(children)}</ReactMarkdown>
    </div>
  );
}
