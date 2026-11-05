import { useMemo, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { formatUserHandle } from "../utils/helper.ts";
import {
  buildLinkTarget,
  linkMentions,
  parseLinkTarget,
  transformLinkTarget,
  type LinkScheme,
} from "../utils/link-scheme.ts";
import { buildPlaceMapHref } from "../utils/place-map-link.ts";
import type { MentionablePlace } from "../utils/place-mentions.ts";
import { presentSticker } from "../utils/sticker-presentation.ts";
import { Sticker } from "./sticker.tsx";

/**
 * What a link scheme's component gets from the markdown: the id after the scheme and the link's
 * text. Anything else it shows, it resolves client-side from that id.
 */
interface SchemeLinkProps {
  id: string;
  label: ReactNode;
}

type SchemeLinks = Record<LinkScheme, (props: SchemeLinkProps) => ReactElement>;

/** The component of each link scheme the Assistant may write. */
function createSchemeLinks(accounts: Array<SidebarUser>): SchemeLinks {
  return {
    // A Place mention opens the map in the same tab.
    place: ({ id, label }) => (
      <a href={buildPlaceMapHref(id)} className="tw:underline">
        {label}
      </a>
    ),
    user: ({ id }) => (
      <Sticker sticker={presentSticker("mention", formatUserHandle(id), accounts)} />
    ),
  };
}

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
            url: buildLinkTarget("place", place.id),
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
        node.url = buildLinkTarget("place", place.id);
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

function transformTarget(url: string): string | null | undefined {
  return transformLinkTarget(url, defaultUrlTransform);
}

function createComponents(accounts: Array<SidebarUser>): Components {
  const schemeLinks = createSchemeLinks(accounts);
  return {
    a: ({ children, href }) => {
      const target = href === undefined ? undefined : parseLinkTarget(href);
      if (target !== undefined) {
        return schemeLinks[target.scheme]({ id: target.id, label: children });
      }
      return (
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
        urlTransform={transformTarget}
      >
        {linkMentions(children, accounts)}
      </ReactMarkdown>
    </div>
  );
}
