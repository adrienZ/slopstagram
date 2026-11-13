import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLatest } from "react-use";
import type { LayoutPosition } from "./use-force-layout.ts";

/** The size of the graph's drawing, in SVG units: its `viewBox`. */
export const GRAPH_WIDTH = 1000;
export const GRAPH_HEIGHT = 700;

/** Where the layout's origin sits in the drawing, and how much it is scaled. */
export interface GraphView {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const BUTTON_ZOOM_FACTOR = 1.25;
const FIT_MARGIN = 48;
/** How far, in screen pixels, a pointer travels before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** The view that shows every point, without enlarging a small graph. */
function fitView(positions: Iterable<LayoutPosition>): GraphView {
  const all = [...positions];
  const xs = all.map(({ x }) => x);
  const ys = all.map(({ y }) => y);
  const [left, right, top, bottom] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = clampScale(
    Math.min(
      1,
      GRAPH_WIDTH / (right - left + 2 * FIT_MARGIN),
      GRAPH_HEIGHT / (bottom - top + 2 * FIT_MARGIN),
    ),
  );
  return {
    x: GRAPH_WIDTH / 2 - (scale * (left + right)) / 2,
    y: GRAPH_HEIGHT / 2 - (scale * (top + bottom)) / 2,
    scale,
  };
}

/** Scales the view by `factor` while `anchor`, a point of the drawing, stays in place. */
function zoomAround(view: GraphView, factor: number, anchor: LayoutPosition): GraphView {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return {
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
    scale,
  };
}

/** A pointer position in drawing units: the SVG letterboxes its `viewBox` to keep its ratio. */
function toDrawing(svg: SVGSVGElement, clientX: number, clientY: number): LayoutPosition {
  const rect = svg.getBoundingClientRect();
  const ratio = Math.min(rect.width / GRAPH_WIDTH, rect.height / GRAPH_HEIGHT);
  return {
    x: (clientX - rect.left - (rect.width - GRAPH_WIDTH * ratio) / 2) / ratio,
    y: (clientY - rect.top - (rect.height - GRAPH_HEIGHT * ratio) / 2) / ratio,
  };
}

interface GraphViewportOptions {
  positions: Map<string, LayoutPosition>;
  pin: (id: string, position: LayoutPosition) => void;
  release: (id: string) => void;
}

/**
 * Pan, zoom and point dragging over a force layout. A press that moves becomes a drag, and the
 * click that ends it is swallowed, so that dragging never selects or clears a point.
 */
export function useGraphViewport({ positions, pin, release }: GraphViewportOptions) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(() => fitView(positions.values()));
  const latestView = useLatest(view);
  const dragged = useRef(false);

  function track(
    event: ReactPointerEvent,
    onMove: (to: LayoutPosition, from: LayoutPosition) => void,
    onEnd: () => void,
  ) {
    const element = svg.current;
    if (element === null || event.button !== 0) {
      return;
    }
    const { pointerId, clientX: startX, clientY: startY } = event;
    const from = toDrawing(element, startX, startY);
    const frame = element.ownerDocument.defaultView;
    dragged.current = false;
    function move(next: PointerEvent) {
      if (next.pointerId !== pointerId || element === null) {
        return;
      }
      if (
        !dragged.current &&
        Math.hypot(next.clientX - startX, next.clientY - startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      dragged.current = true;
      onMove(toDrawing(element, next.clientX, next.clientY), from);
    }
    function end(last: PointerEvent) {
      if (last.pointerId !== pointerId) {
        return;
      }
      frame?.removeEventListener("pointermove", move);
      frame?.removeEventListener("pointerup", end);
      frame?.removeEventListener("pointercancel", end);
      if (dragged.current) {
        onEnd();
      }
    }
    frame?.addEventListener("pointermove", move);
    frame?.addEventListener("pointerup", end);
    frame?.addEventListener("pointercancel", end);
  }

  function startPointDrag(event: ReactPointerEvent, id: string) {
    event.stopPropagation();
    track(
      event,
      (to) => {
        const { current } = latestView;
        pin(id, { x: (to.x - current.x) / current.scale, y: (to.y - current.y) / current.scale });
      },
      () => {
        release(id);
      },
    );
  }

  function startPan(event: ReactPointerEvent) {
    const start = latestView.current;
    track(
      event,
      (to, from) => {
        setView({ ...start, x: start.x + to.x - from.x, y: start.y + to.y - from.y });
      },
      () => {
        // A pan only moves the view: nothing to let go of.
      },
    );
  }

  /** Whether a click is a real click, not the end of a drag. */
  function isClick(): boolean {
    const click = !dragged.current;
    dragged.current = false;
    return click;
  }

  function zoom(factor: number) {
    setView((current) => zoomAround(current, factor, { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 }));
  }

  // Stable, so React attaches the wheel listener once rather than on every simulation tick.
  const attach = useMemo(() => {
    function zoomWithWheel(event: WheelEvent) {
      const element = svg.current;
      if (element === null) {
        return;
      }
      event.preventDefault();
      const anchor = toDrawing(element, event.clientX, event.clientY);
      setView((current) => zoomAround(current, Math.exp(-event.deltaY / 500), anchor));
    }
    // React listens to wheel events passively, which cannot keep the page from scrolling.
    return function attachWheelZoom(element: SVGSVGElement | null) {
      svg.current = element;
      element?.addEventListener("wheel", zoomWithWheel, { passive: false });
      return () => {
        element?.removeEventListener("wheel", zoomWithWheel);
      };
    };
  }, []);

  return {
    attach,
    view,
    startPan,
    startPointDrag,
    isClick,
    zoomIn: () => {
      zoom(BUTTON_ZOOM_FACTOR);
    },
    zoomOut: () => {
      zoom(1 / BUTTON_ZOOM_FACTOR);
    },
    recenter: () => {
      setView(fitView(positions.values()));
    },
  };
}
