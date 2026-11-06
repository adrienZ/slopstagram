import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import type { SidebarUser } from "@/loaders/sidebar-users.ts";
import { formatUserHandle } from "@/utils/helper.ts";
import { buildPlaceMapHref } from "@/utils/place-map-link.ts";
import type { MentionablePlace } from "@/utils/place-mentions.ts";
import { presentSticker } from "@/utils/sticker-presentation.ts";
import { Sticker } from "@/components/sticker.tsx";

const mentionPattern = /(?<![\w/:.@])@(?<username>\w+(?:\.\w+)*)/gu;
const profilePath = "/users/";
/** The link target the Assistant writes for a Place mention: `place:<place id>`. */
const placeScheme = "place:";

/**
 * Turns a Place mention's target into a link to the place on the map, and drops the unsafe
 * targets as the renderer does by default.
 */
function transformLinkTarget(url: string): string {
  return url.startsWith(placeScheme)
    ? buildPlaceMapHref(url.slice(placeScheme.length))
    : defaultUrlTransform(url);
}

const placeMapHrefPrefix = buildPlaceMapHref("");

/** The markdown tree nodes the place linking reads and writes. */
interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: Array<MarkdownNode>;
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function textOf(node: MarkdownNode): string {
  return node.value ?? node.children?.map(textOf).join("") ?? "";
}

/**
 * A remark plugin writing each name of the places the Assistant read as a Place mention: a small
 * model often names a place without its `place:` link, or links it elsewhere.
 */
function linkPlaceNames(places: Array<MentionablePlace>) {
  const byName = new Map(places.map((place) => [place.name.toLowerCase(), place]));
  // The longest names first, so that a name containing another one wins.
  const names = [...byName.keys()].toSorted((left, right) => right.length - left.length);
  const pattern = new RegExp(
    String.raw`(?<![\p{L}\p{N}])(?:${names.map(escapeRegExp).join("|")})(?![\p{L}\p{N}])`,
    "giu",
  );
  function split(value: string): Array<MarkdownNode> {
    const nodes: Array<MarkdownNode> = [];
    let end = 0;
    for (const match of value.matchAll(pattern)) {
      const place = byName.get(match[0].toLowerCase());
      if (place !== undefined) {
        nodes.push(
          { type: "text", value: value.slice(end, match.index) },
          {
            type: "link",
            url: `${placeScheme}${place.id}`,
            children: [{ type: "text", value: match[0] }],
          },
        );
        end = match.index + match[0].length;
      }
    }
    nodes.push({ type: "text", value: value.slice(end) });
    return nodes.filter((node) => node.type !== "text" || node.value !== "");
  }
  function visit(node: MarkdownNode): void {
    if (node.type === "link") {
      const place = byName.get(textOf(node).trim().toLowerCase());
      if (place !== undefined) {
        node.url = `${placeScheme}${place.id}`;
      }
      return;
    }
    node.children = node.children?.flatMap((child) => {
      if (child.type === "text") {
        return split(child.value ?? "");
      }
      visit(child);
      return [child];
    });
  }
  return () => (tree: MarkdownNode) => {
    if (names.length > 0) {
      visit(tree);
    }
  };
}

/**
 * Writes each `@username` of a account as a link to its profile, which the chat shows as a
 * sticker. A name that is not a account stays plain text.
 */
function linkMentions(text: string, accounts: Array<SidebarUser>): string {
  return text.replaceAll(mentionPattern, (mention, username: string) => {
    const account = accounts.find(
      (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
    );
    return account === undefined ? mention : `[${mention}](${profilePath}${account.username})`;
  });
}

function createComponents(accounts: Array<SidebarUser>): Components {
  return {
    a: ({ children, href }) => {
      if (href?.startsWith(profilePath) === true) {
        return (
          <Sticker
            sticker={presentSticker(
              "mention",
              formatUserHandle(href.slice(profilePath.length)),
              accounts,
            )}
          />
        );
      }
      // A Place mention opens the map in the same tab.
      return href?.startsWith(placeMapHrefPrefix) === true ? (
        <a href={href} className="tw:underline">
          {children}
        </a>
      ) : (
        <a href={href} className="tw:underline" target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    p: ({ children }) => <p className="tw:leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="tw:list-disc tw:space-y-1 tw:pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="tw:list-decimal tw:space-y-1 tw:pl-5">{children}</ol>,
    strong: ({ children }) => <strong className="tw:font-semibold">{children}</strong>,
  };
}

/**
 * The Assistant's text, which the model writes as markdown, with the mentions of accounts as
 * the stickers of the story feed and its Place mentions, and the names of the places it read,
 * as links to the map. Raw HTML in it is
 * not rendered, and unsafe link targets are dropped by the renderer.
 */
export function ChatMarkdown({
  accounts,
  children,
  places = [],
}: {
  accounts: Array<SidebarUser>;
  children: string;
  /** The places the Assistant read in this message: its answer links them where it names them. */
  places?: Array<MentionablePlace>;
}) {
  const components = useMemo(() => createComponents(accounts), [accounts]);
  const remarkPlugins = useMemo(() => [linkPlaceNames(places)], [places]);
  return (
    <div className="tw:grid tw:gap-3">
      <ReactMarkdown
        components={components}
        remarkPlugins={remarkPlugins}
        urlTransform={transformLinkTarget}
      >
        {linkMentions(children, accounts)}
      </ReactMarkdown>
    </div>
  );
}
