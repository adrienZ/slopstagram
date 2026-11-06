import type { MentionablePlace } from "../../utils/place-mentions.ts";

/** The link target the Assistant writes for a Place mention: `place:<place id>`. */
export const placeScheme = "place:";

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
export function linkPlaceNames(places: Array<MentionablePlace>) {
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
