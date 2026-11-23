import {
  createForceSimulation,
  roundCoordinate,
  type LayoutLink,
  type LayoutNode,
  type LayoutPosition,
} from "@@/core/domains/mention-connections/force-simulation.ts";
import { useMemo } from "react";
import { useUnmount } from "react-use";

const DRAG_ALPHA_TARGET = 0.3;

/** How many links away from a dragged point the others still follow it. */
const FOLLOW_DEPTH = 2;

type MovedListener = (moved: ReadonlySet<string>) => void;

function collectNeighbours(links: Array<LayoutLink>): Map<string, Array<string>> {
  const neighbours = new Map<string, Array<string>>();

  for (const { source, target } of links) {
    neighbours.set(source, [...(neighbours.get(source) ?? []), target]);
    neighbours.set(target, [...(neighbours.get(target) ?? []), source]);
  }

  return neighbours;
}

/**
 * Starts from positions the server already settled, so the first render shows the graph at rest
 * and no simulation runs until a point is dragged. Dragging only moves the points within
 * `FOLLOW_DEPTH` links of the dragged one and holds the others still: a graph of thousands of
 * points could not be redrawn at every tick. Moves are announced to listeners rather than
 * rendered, for the same reason.
 */
function createForceLayout(points: Array<LayoutNode & LayoutPosition>, links: Array<LayoutLink>) {
  const nodes: Array<LayoutNode> = points.map(({ id, x, y }) => ({ id, x, y }));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const neighbours = collectNeighbours(links);
  const listeners = new Set<MovedListener>();
  const positions = new Map<string, LayoutPosition>();
  let moving: ReadonlySet<string> = new Set();
  let simulation: ReturnType<typeof createForceSimulation> | undefined;

  function readPosition({ id, x, y }: LayoutNode) {
    positions.set(id, { x: roundCoordinate(x), y: roundCoordinate(y) });
  }

  for (const node of nodes) {
    readPosition(node);
  }

  function getSimulation() {
    // Already at rest, so it must not restart hot and scatter the layout it was given.
    simulation ??= createForceSimulation(nodes, links)
      .alpha(0)
      .on("tick", () => {
        for (const id of moving) {
          const node = nodesById.get(id);

          if (node !== undefined) {
            readPosition(node);
          }
        }

        for (const listener of listeners) {
          listener(moving);
        }
      });

    return simulation;
  }

  function reachFrom(id: string): Set<string> {
    let reached = new Set([id]);

    for (let depth = 0; depth < FOLLOW_DEPTH; depth += 1) {
      reached = new Set([...reached].flatMap((from) => [from, ...(neighbours.get(from) ?? [])]));
    }

    return reached;
  }

  function holdStillExcept(followers: ReadonlySet<string>) {
    for (const node of nodes) {
      const free = followers.has(node.id);
      node.fx = free ? null : (node.x ?? 0);
      node.fy = free ? null : (node.y ?? 0);
    }
  }

  let dragged: string | undefined;

  return {
    getPositions: () => positions,
    subscribe: (listener: MovedListener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    /** Holds a point where the pointer is and lets the ones around it react. */
    pin: (id: string, { x, y }: LayoutPosition) => {
      const node = nodesById.get(id);

      if (node === undefined) {
        return;
      }

      if (dragged !== id) {
        dragged = id;
        moving = reachFrom(id);
        holdStillExcept(moving);
      }

      node.fx = x;
      node.fy = y;
      getSimulation().alphaTarget(DRAG_ALPHA_TARGET).restart();
    },
    /** Lets a pinned point go: the simulation cools down and stops by itself. */
    release: (id: string) => {
      const node = nodesById.get(id);

      if (node === undefined) {
        return;
      }

      dragged = undefined;
      node.fx = null;
      node.fy = null;
      simulation?.alphaTarget(0);
    },
    stop: () => {
      simulation?.stop();
    },
  };
}

/**
 * The positions of a graph's points, as laid out by the server, and the means to drag them. The
 * layout restarts from the given positions when `points` or `links` is another array.
 */
export function useForceLayout(
  points: Array<LayoutNode & LayoutPosition>,
  links: Array<LayoutLink>,
) {
  const layout = useMemo(() => createForceLayout(points, links), [points, links]);

  useUnmount(layout.stop);

  return layout;
}
