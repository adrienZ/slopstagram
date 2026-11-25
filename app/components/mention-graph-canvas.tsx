import { forceX, forceY } from "d3-force";
import ForceGraph from "force-graph";
import { LocateFixedIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLatest } from "react-use";
import { Button } from "../shadcn/ui/button.tsx";
import { MentionGraphLoading } from "./mention-graph-loading.tsx";
import type { MentionGraphCanvasProps } from "./mention-graph-canvas-context.ts";
import {
  connectionWidth,
  createPainter,
  drawConnection,
  radiusOf,
  readPalette,
  type GraphLink,
  type GraphNode,
  type Scene,
} from "./mention-graph-drawing.ts";

type Graph = ForceGraph<GraphNode, GraphLink>;

const CONNECTION_HIT_WIDTH = 14;

/** Ticks for the simulation to cool down from its first, hottest step. */
const SETTLE_TICKS = 300;

// Enough for a readable first frame: the rest of the settling plays on screen.
const WARMUP_TICKS = 60;

// Pulls every point towards the origin, so separate groups of points never drift out of view.
const ORIGIN_PULL = 0.06;

const REFIT_DURATION_MS = 400;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const BUTTON_ZOOM_FACTOR = 1.25;
const FIT_MARGIN = 48;

/** Shows every point, without enlarging a small graph. */
function fit(graph: Graph, durationMs = 0) {
  const {
    x: [left, right],
    y: [top, bottom],
  } = graph.getGraphBbox();

  const scale = Math.min(
    1,
    graph.width() / (right - left + 2 * FIT_MARGIN),
    graph.height() / (bottom - top + 2 * FIT_MARGIN),
  );

  graph.centerAt((left + right) / 2, (top + bottom) / 2, durationMs);
  graph.zoom(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)), durationMs);
}

// force-graph redraws only when a styling prop is set, not when the state it reads changes.
function requestRedraw(graph: Graph) {
  graph.nodeCanvasObject(graph.nodeCanvasObject());
}

function createGraph(
  container: HTMLElement,
  { points, connections }: Pick<MentionGraphCanvasProps, "points" | "connections">,
  latest: { current: MentionGraphCanvasProps },
  onZoom: (scale: number) => void,
  onFirstFrame: () => void,
) {
  const nodes: Array<GraphNode> = points.map((point) => ({ id: point.id, point }));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const links: Array<GraphLink> = connections.map((connection) => ({
    source: connection.source,
    target: connection.target,
    connection,
  }));

  let fitted = false;
  let settled = false;
  let moved = false;
  const listeners = new globalThis.AbortController();
  const graph: Graph = new ForceGraph<GraphNode, GraphLink>(container);

  const painter = createPainter(connections, nodesById, () => {
    requestRedraw(graph);
  });

  let scene: Scene = { ...latest.current, palette: readPalette(container) };

  graph
    // Sized before the first fit: force-graph otherwise starts at the window's size.
    .width(container.clientWidth)
    .height(container.clientHeight)
    .graphData({ nodes, links })
    .nodeId("id")
    .nodeLabel(() => "")
    .linkLabel(() => "")
    .nodeCanvasObject((node, context) => {
      painter.drawPoint(node, context, scene);
    })
    .nodePointerAreaPaint((node, color, context) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(node.x ?? 0, node.y ?? 0, radiusOf(node.point), 0, 2 * Math.PI);
      context.fill();
    })
    .linkCanvasObject((link, context) => {
      drawConnection(link, context, scene);
    })
    .linkWidth((link) => connectionWidth(link.connection.storyPks.length))
    .linkHoverPrecision(CONNECTION_HIT_WIDTH / 2)
    .onRenderFramePre(() => {
      // Read on every redraw, so the drawing follows the selection and the light or dark theme.
      scene = { ...latest.current, palette: readPalette(container) };
    })
    .onRenderFramePost((context) => {
      painter.drawHoverLabel(context, scene);
    })
    .minZoom(MIN_SCALE)
    .maxZoom(MAX_SCALE)
    .warmupTicks(WARMUP_TICKS)
    // The warmup and the settling on screen add up to a full cool-down, also as long as a released
    // point takes. A d3AlphaMin would stop the engine before a drag can reheat it, since
    // force-graph checks alpha before each tick.
    .cooldownTicks(SETTLE_TICKS - WARMUP_TICKS)
    .onEngineTick(() => {
      if (!fitted) {
        fitted = true;
        fit(graph);
        onFirstFrame();
      }
    })
    .onEngineStop(() => {
      // The first layout spreads out while it settles: fit it again, unless the view was moved.
      if (!settled && !moved) {
        fit(graph, REFIT_DURATION_MS);
      }

      settled = true;
    })
    .onZoom(({ k }) => {
      onZoom(k);
    })
    .onNodeClick((node) => {
      latest.current.onSelectPoint(node.id);
    })
    .onLinkClick((link) => {
      latest.current.onSelectConnection(link.connection.id);
    })
    .onBackgroundClick(() => {
      latest.current.onSelectPoint(null);
    })
    .onNodeHover((node) => {
      latest.current.onHoverPoint(node?.id ?? null);
    });

  // oxlint-disable-next-line typescript/no-unsafe-call -- force-graph types its d3 forces as any.
  graph.d3Force("link")?.distance(90);
  // oxlint-disable-next-line typescript/no-unsafe-call -- force-graph types its d3 forces as any.
  graph.d3Force("charge")?.strength(-240);
  graph.d3Force("center", null);
  graph.d3Force("x", forceX<GraphNode>(0).strength(ORIGIN_PULL));
  graph.d3Force("y", forceY<GraphNode>(0).strength(ORIGIN_PULL));

  const resize = new globalThis.ResizeObserver(() => {
    graph.width(container.clientWidth).height(container.clientHeight);
  });

  resize.observe(container);

  function markMoved() {
    moved = true;
  }

  // The theme switches the root's class, which swaps the colour tokens the drawing reads.
  const theme = new globalThis.MutationObserver(() => {
    requestRedraw(graph);
  });

  theme.observe(container.ownerDocument.documentElement, { attributeFilter: ["class"] });

  container.addEventListener("pointerdown", markMoved, { once: true, signal: listeners.signal });
  container.addEventListener("wheel", markMoved, { once: true, signal: listeners.signal });

  function locate(node: GraphNode): DOMRect {
    const bounds = container.getBoundingClientRect();
    const { x, y } = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0);
    const radius = radiusOf(node.point) * graph.zoom();

    return globalThis.DOMRect.fromRect({
      x: bounds.left + x - radius,
      y: bounds.top + y - radius,
      width: 2 * radius,
      height: 2 * radius,
    });
  }

  latest.current.locatorRef.current = (id) => {
    const node = nodesById.get(id);

    return node && locate(node);
  };

  return {
    graph,
    dispose: () => {
      resize.disconnect();
      theme.disconnect();
      listeners.abort();
      latest.current.locatorRef.current = null;
      graph._destructor();
    },
  };
}

function GraphControls({ graph, scale }: { graph: Graph | null; scale: number }) {
  const { t } = useTranslation();

  return (
    <div
      role="toolbar"
      aria-label={t("graph.controls")}
      className="tw:absolute tw:right-3 tw:bottom-3 tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:bg-background tw:p-1 tw:shadow-sm"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("graph.zoomOut")}
        onClick={() => {
          graph?.zoom(graph.zoom() / BUTTON_ZOOM_FACTOR, 200);
        }}
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <output aria-label={t("graph.zoomLevel")} className="tw:w-12 tw:text-center tw:text-xs">
        {`${Math.round(scale * 100)} %`}
      </output>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("graph.zoomIn")}
        onClick={() => {
          graph?.zoom(graph.zoom() * BUTTON_ZOOM_FACTOR, 200);
        }}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("graph.recenter")}
        onClick={() => {
          if (graph !== null) {
            fit(graph);
          }
        }}
      >
        <LocateFixedIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * The Mention connections drawn by force-graph on a canvas: points can be dragged, the background
 * panned, and the view zoomed. The page keeps the accessible buttons; this only draws and points.
 */
export default function MentionGraphCanvas(props: MentionGraphCanvasProps) {
  const { points, connections } = props;
  const latest = useLatest(props);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [scale, setScale] = useState(1);
  const [drawn, setDrawn] = useState(false);

  // Stable per graph, so React builds force-graph once and destroys it with the element.
  const attach = useMemo(
    () =>
      function attachGraph(container: HTMLDivElement | null) {
        const created =
          container === null
            ? null
            : createGraph(container, { points, connections }, latest, setScale, () => {
                setDrawn(true);
              });

        // A force-graph instance is a function, which setState would call as an updater.
        setGraph(() => created?.graph ?? null);

        return () => {
          created?.dispose();
        };
      },
    [points, connections, latest],
  );

  return (
    <>
      <div ref={attach} aria-hidden="true" className="tw:size-full" />
      {!drawn && <MentionGraphLoading />}
      {/* A new ref callback runs after every commit: force-graph redraws once the props it reads
          are current, without an effect. */}
      <span
        hidden
        ref={() => {
          if (graph !== null) {
            requestRedraw(graph);
          }
        }}
      />
      <GraphControls graph={graph} scale={scale} />
    </>
  );
}
