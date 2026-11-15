import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useMemo, useSyncExternalStore } from "react";
import { useUnmount } from "react-use";

export interface LayoutPosition {
  x: number;
  y: number;
}

interface LayoutNode extends SimulationNodeDatum {
  id: string;
}

interface LayoutLink {
  source: string;
  target: string;
}

/** Enough ticks for the simulation to cool down from its first, hottest step. */
const SETTLE_TICKS = 300;
const DRAG_ALPHA_TARGET = 0.3;

// Rounded so the server and the browser render the same coordinates when the page hydrates.
function roundCoordinate(value: number | undefined): number {
  return Math.round((value ?? 0) * 10) / 10;
}

function readPositions(nodes: Array<LayoutNode>): Map<string, LayoutPosition> {
  return new Map(
    nodes.map(({ id, x, y }) => [id, { x: roundCoordinate(x), y: roundCoordinate(y) }]),
  );
}

/**
 * A force simulation already settled, so the first render shows the graph at rest. It only runs
 * again while a point is dragged, and cools down once the point is released.
 */
function createForceLayout(points: Array<{ id: string }>, links: Array<LayoutLink>) {
  const nodes: Array<LayoutNode> = points.map(({ id }) => ({ id }));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(
        links.map(({ source, target }) => ({ source, target })),
      )
        .id(({ id }) => id)
        .distance(90),
    )
    .force("charge", forceManyBody().strength(-240))
    .force("collide", forceCollide(28))
    // Pulls the separate groups of points towards the middle, so none drifts out of view.
    .force("x", forceX(0).strength(0.06))
    .force("y", forceY(0).strength(0.06))
    .stop()
    .tick(SETTLE_TICKS);
  let positions = readPositions(nodes);
  const listeners = new Set<() => void>();
  simulation.on("tick", () => {
    positions = readPositions(nodes);
    for (const listener of listeners) {
      listener();
    }
  });

  return {
    getPositions: () => positions,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Holds a point where the pointer is and lets the others react to it. */
    pin: (id: string, { x, y }: LayoutPosition) => {
      const node = nodesById.get(id);
      if (node === undefined) {
        return;
      }
      node.fx = x;
      node.fy = y;
      simulation.alphaTarget(DRAG_ALPHA_TARGET).restart();
    },
    /** Lets a pinned point go: the simulation cools down and stops by itself. */
    release: (id: string) => {
      const node = nodesById.get(id);
      if (node === undefined) {
        return;
      }
      node.fx = null;
      node.fy = null;
      simulation.alphaTarget(0);
    },
    stop: () => {
      simulation.stop();
    },
  };
}

/**
 * The positions of a graph's points, laid out by a force simulation centred on the origin. The
 * layout restarts from scratch when `points` or `links` is another array.
 */
export function useForceLayout(points: Array<{ id: string }>, links: Array<LayoutLink>) {
  const layout = useMemo(() => createForceLayout(points, links), [points, links]);
  const positions = useSyncExternalStore(
    layout.subscribe,
    layout.getPositions,
    layout.getPositions,
  );
  useUnmount(layout.stop);
  return { positions, pin: layout.pin, release: layout.release };
}
