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

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutNode extends SimulationNodeDatum {
  id: string;
}

export interface LayoutLink {
  source: string;
  target: string;
}

/** Enough ticks for the simulation to cool down from its first, hottest step. */
export const SETTLE_TICKS = 300;

/** Rounded so the server and the browser agree on the coordinates they draw. */
export function roundCoordinate(value: number | undefined): number {
  return Math.round((value ?? 0) * 10) / 10;
}

/** A stopped force simulation centred on the origin. The caller decides when it ticks. */
export function createForceSimulation(nodes: Array<LayoutNode>, links: Array<LayoutLink>) {
  return (
    forceSimulation(nodes)
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
  );
}
