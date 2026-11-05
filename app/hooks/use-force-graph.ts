import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";
import { useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";

interface Point extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
}
interface ForceGraphData {
  nodes: Array<{ id: string }>;
  connections: Array<{ source: string; target: string }>;
}
interface View {
  x: number;
  y: number;
  zoom: number;
}
type Gesture = { pointerId: number; startX: number; startY: number; moved: boolean } & (
  | { kind: "node"; node: Point }
  | { kind: "pan"; view: View }
);
const DEFAULT_VIEW: View = { x: 0, y: 0, zoom: 1 };
export const GRAPH_WIDTH = 1000;
export const GRAPH_HEIGHT = 700;

function coordinates(event: PointerEvent<SVGSVGElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const scale =
    rect.width > 0 && rect.height > 0
      ? Math.min(rect.width / GRAPH_WIDTH, rect.height / GRAPH_HEIGHT)
      : 1;
  return {
    x:
      (event.clientX - rect.left - (rect.width > 0 ? (rect.width - GRAPH_WIDTH * scale) / 2 : 0)) /
      scale,
    y:
      (event.clientY -
        rect.top -
        (rect.height > 0 ? (rect.height - GRAPH_HEIGHT * scale) / 2 : 0)) /
      scale,
  };
}

function createGraphSimulation({ nodes, connections }: ForceGraphData) {
  const points: Array<Point> = nodes.map(({ id }, index) => ({
    id,
    x: 500 + 200 * Math.cos(index * 2.4),
    y: 350 + 200 * Math.sin(index * 2.4),
  }));
  const running = forceSimulation(points)
    .stop()
    .force(
      "link",
      forceLink<Point, { source: string; target: string }>(
        connections.map(({ source, target }) => ({ source, target })),
      )
        .id(({ id }) => id)
        .distance(110),
    )
    .force("charge", forceManyBody().strength(-220))
    .force("collision", forceCollide(30))
    .force("center", forceCenter(GRAPH_WIDTH / 2, GRAPH_HEIGHT / 2));
  const initial = points.map((point) => ({ ...point }));
  let snapshot = initial;
  return {
    running,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (notify: () => void) => {
      running
        .on("tick", () => {
          snapshot = points.map((point) => ({ ...point }));
          notify();
        })
        .restart();
      return () => {
        running.stop();
        running.on("tick", null);
      };
    },
  };
}

/** The simulation and pointer lifecycle stay independent of graph identity and rendering. */
export function useForceGraph({ nodes, connections }: ForceGraphData) {
  const store = useMemo(() => createGraphSimulation({ nodes, connections }), [nodes, connections]);
  const positions = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [view, setView] = useState(DEFAULT_VIEW);
  const simulation = store.running;
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);

  function startNode(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const node = simulation.nodes().find((point) => point.id === id);
    if (!node) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    gesture.current = {
      kind: "node",
      node,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function startPan(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    const point = coordinates(event);
    gesture.current = {
      kind: "pan",
      view,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      moved: false,
    };
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const point = coordinates(event);
    if (active.kind === "pan") {
      const dx = point.x - active.startX;
      const dy = point.y - active.startY;
      if (Math.hypot(dx, dy) > 4) {
        active.moved = true;
      }
      setView({ ...active.view, x: active.view.x + dx, y: active.view.y + dy });
    } else {
      if (
        Math.hypot(event.clientX - active.startX, event.clientY - active.startY) <= 4 &&
        !active.moved
      ) {
        return;
      }
      active.moved = true;
      active.node.fx = (point.x - view.x) / view.zoom;
      active.node.fy = (point.y - view.y) / view.zoom;
      simulation.alphaTarget(0.25).restart();
    }
  }

  function release() {
    const active = gesture.current;
    if (!active) {
      return;
    }
    if (active.kind === "node") {
      active.node.fx = null;
      active.node.fy = null;
      simulation.alphaTarget(0);
    }
    suppressClick.current = active.moved;
    gesture.current = null;
  }

  function acceptClick() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return false;
    }
    return true;
  }

  function zoom(factor: number) {
    setView((current) => {
      const next = Math.min(4, Math.max(0.2, current.zoom * factor));
      const ratio = next / current.zoom;
      return {
        zoom: next,
        x: GRAPH_WIDTH / 2 - (GRAPH_WIDTH / 2 - current.x) * ratio,
        y: GRAPH_HEIGHT / 2 - (GRAPH_HEIGHT / 2 - current.y) * ratio,
      };
    });
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 0.9 : 1.1);
  }

  function bindWheel(element: SVGSVGElement | null) {
    element?.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element?.removeEventListener("wheel", handleWheel);
    };
  }

  function recenter() {
    const points = simulation.nodes();
    if (points.length === 0) {
      setView(DEFAULT_VIEW);
      return;
    }
    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    const left = Math.min(...xs) - 60;
    const top = Math.min(...ys) - 60;
    const width = Math.max(...xs) + 60 - left;
    const height = Math.max(...ys) + 60 - top;
    const next = Math.min(1, GRAPH_WIDTH / width, GRAPH_HEIGHT / height);
    setView({
      zoom: next,
      x: (GRAPH_WIDTH - width * next) / 2 - left * next,
      y: (GRAPH_HEIGHT - height * next) / 2 - top * next,
    });
  }

  return {
    positions: new Map(positions.map((point) => [point.id, point])),
    view,
    startNode,
    startPan,
    move,
    release,
    acceptClick,
    zoom,
    recenter,
    bindWheel,
  };
}
