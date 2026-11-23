import { createHash } from "node:crypto";
import {
  createForceSimulation,
  roundCoordinate,
  SETTLE_TICKS,
  type LayoutLink,
  type LayoutNode,
  type LayoutPosition,
} from "./force-simulation.ts";

const MAX_CACHED_LAYOUTS = 16;

const layouts = new Map<string, Map<string, LayoutPosition>>();

/**
 * The simulation is deterministic, so a layout depends only on its points and connections: keying
 * the cache on it never serves a stale layout, whatever was ingested since.
 */
function toGraphKey(points: Array<{ id: string }>, links: Array<LayoutLink>): string {
  return createHash("sha256")
    .update(
      JSON.stringify([points.map(({ id }) => id), links.map((link) => [link.source, link.target])]),
    )
    .digest("hex");
}

function settle(points: Array<{ id: string }>, links: Array<LayoutLink>) {
  const nodes: Array<LayoutNode> = points.map(({ id }) => ({ id }));
  createForceSimulation(nodes, links).tick(SETTLE_TICKS);

  return new Map(
    nodes.map(({ id, x, y }) => [id, { x: roundCoordinate(x), y: roundCoordinate(y) }]),
  );
}

/** Where each point rests once the force simulation has cooled down, by point id. */
export function layoutGraph(
  points: Array<{ id: string }>,
  links: Array<LayoutLink>,
): Map<string, LayoutPosition> {
  const key = toGraphKey(points, links);
  const cached = layouts.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const layout = settle(points, links);

  if (layouts.size >= MAX_CACHED_LAYOUTS) {
    for (const oldest of layouts.keys().take(1)) {
      layouts.delete(oldest);
    }
  }

  layouts.set(key, layout);

  return layout;
}
