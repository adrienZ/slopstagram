import type { LayoutPosition } from "@@/core/domains/mention-connections/force-simulation.ts";
import { useMemo, useRef, useSyncExternalStore } from "react";
import type { useForceLayout } from "./use-force-layout.ts";

interface PaintedConnection {
  id: string;
  source: string;
  target: string;
}

function getNothing(): null {
  return null;
}

export function toTransform({ x, y }: LayoutPosition): string {
  return `translate(${x} ${y})`;
}

function track(elements: Map<string, SVGElement>, id: string, element: SVGElement | null) {
  if (element === null) {
    elements.delete(id);
  } else {
    elements.set(id, element);
  }
}

/**
 * Moves the points a drag displaces straight in the DOM, as their layout announces it. Rendering
 * the graph again at every tick of the simulation costs far more than a frame; the next render
 * reads the same positions, so the two never disagree.
 */
export function useGraphPainter(
  layout: ReturnType<typeof useForceLayout>,
  connections: Array<PaintedConnection>,
) {
  const pointElements = useRef(new Map<string, SVGElement>());
  const labelElements = useRef(new Map<string, SVGElement>());
  const connectionElements = useRef(new Map<string, SVGElement>());

  const connectionsByPoint = useMemo(() => {
    const byPoint = new Map<string, Array<PaintedConnection>>();

    for (const connection of connections) {
      for (const id of [connection.source, connection.target]) {
        byPoint.set(id, [...(byPoint.get(id) ?? []), connection]);
      }
    }

    return byPoint;
  }, [connections]);

  const subscribe = useMemo(
    () =>
      function subscribeToMoves() {
        return layout.subscribe((moved) => {
          const positions = layout.getPositions();
          const repainted = new Set<PaintedConnection>();

          for (const id of moved) {
            const position = positions.get(id);

            if (position !== undefined) {
              pointElements.current.get(id)?.setAttribute("transform", toTransform(position));
              labelElements.current.get(id)?.setAttribute("transform", toTransform(position));
            }

            for (const connection of connectionsByPoint.get(id) ?? []) {
              repainted.add(connection);
            }
          }

          for (const { id, source, target } of repainted) {
            const from = positions.get(source);
            const to = positions.get(target);

            if (from === undefined || to === undefined) {
              continue;
            }

            for (const line of connectionElements.current.get(id)?.children ?? []) {
              line.setAttribute("x1", String(from.x));
              line.setAttribute("y1", String(from.y));
              line.setAttribute("x2", String(to.x));
              line.setAttribute("y2", String(to.y));
            }
          }
        });
      },
    [layout, connectionsByPoint],
  );

  // Subscribing is all that is needed: the points move in the DOM, so nothing has to render.
  useSyncExternalStore(subscribe, getNothing, getNothing);

  return {
    /** The ref of the element drawing a point. */
    trackPoint: (id: string, element: SVGElement | null) => {
      track(pointElements.current, id, element);
    },
    /** The ref of the label shown over a point. */
    trackLabel: (id: string, element: SVGElement | null) => {
      track(labelElements.current, id, element);
    },
    /** The ref of the element holding a connection's lines. */
    trackConnection: (id: string, element: SVGElement | null) => {
      track(connectionElements.current, id, element);
    },
  };
}
