import {
  connectionWidth,
  radiusOf,
  type GraphLink,
  type GraphNode,
} from "./mention-graph-drawing.ts";

/** Screen pixels around a connection that still count as pointing at it. */
const CONNECTION_HIT_WIDTH = 14;

/** A point stays this easy to reach, however far the view is zoomed out. */
const POINT_MIN_HIT_RADIUS = 8;

interface Position {
  x: number;
  y: number;
}

/** force-graph writes the colour it paints an object with on its hidden canvas onto the object. */
export type Painted<Item> = Item & { __indexColor?: string };

function distance(from: Position, to: Position): number {
  return Math.hypot(from.x - to.x, from.y - to.y);
}

function distanceToSegment(point: Position, start: Position, end: Position): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distance(point, start);
  }

  const along = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const clamped = Math.min(1, Math.max(0, along));

  return distance(point, { x: start.x + clamped * dx, y: start.y + clamped * dy });
}

function isNode(end: GraphLink["source"]): end is GraphNode {
  return typeof end === "object";
}

function pickNode(nodes: Array<GraphNode>, position: Position, scale: number) {
  let picked: GraphNode | null = null;
  let pickedGap = 0;

  for (const node of nodes) {
    const gap =
      distance(position, { x: node.x ?? 0, y: node.y ?? 0 }) -
      Math.max(radiusOf(node.point), POINT_MIN_HIT_RADIUS / scale);

    if (gap <= 0 && (picked === null || gap < pickedGap)) {
      picked = node;
      pickedGap = gap;
    }
  }

  return picked;
}

function pickLink(links: Array<GraphLink>, position: Position, scale: number) {
  let picked: GraphLink | null = null;
  let pickedGap = Number.POSITIVE_INFINITY;

  for (const link of links) {
    const { source, target } = link;

    if (!isNode(source) || !isNode(target)) {
      continue;
    }

    const reach =
      Math.max(CONNECTION_HIT_WIDTH / scale, connectionWidth(link.connection.storyPks.length)) / 2;

    const gap = distanceToSegment(
      position,
      { x: source.x ?? 0, y: source.y ?? 0 },
      { x: target.x ?? 0, y: target.y ?? 0 },
    );

    if (gap <= reach && gap < pickedGap) {
      picked = link;
      pickedGap = gap;
    }
  }

  return picked;
}

/** What is under a position of the graph: the nearest point, else the nearest connection. */
export function pickAt(
  { nodes, links }: { nodes: Array<GraphNode>; links: Array<GraphLink> },
  position: Position,
  scale: number,
): Painted<GraphNode> | Painted<GraphLink> | null {
  return pickNode(nodes, position, scale) ?? pickLink(links, position, scale);
}
