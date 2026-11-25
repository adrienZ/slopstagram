import ForceGraph, { type LinkObject, type NodeObject } from "force-graph";
import { LocateFixedIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLatest } from "react-use";
import { Button } from "../shadcn/ui/button.tsx";
import { formatUserInitials } from "../utils/helper.ts";
import type {
  GraphConnection,
  GraphPoint,
  MentionGraphCanvasProps,
} from "./mention-graph-canvas-context.ts";

interface GraphNode extends NodeObject {
  id: string;
  point: GraphPoint;
}

interface GraphLink extends LinkObject<GraphNode> {
  connection: GraphConnection;
}

type Graph = ForceGraph<GraphNode, GraphLink>;

interface Palette {
  primary: string;
  primaryForeground: string;
  mutedForeground: string;
  foreground: string;
  background: string;
  ring: string;
}

const ACCOUNT_RADIUS = 20;
const UNKNOWN_RADIUS = 7;
const CONNECTION_HIT_WIDTH = 14;

/** Ticks for the simulation to cool down from its first, hottest step. */
const SETTLE_TICKS = 300;

// Enough for a readable first frame: the rest of the settling plays on screen.
const WARMUP_TICKS = 60;

const REFIT_DURATION_MS = 400;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const BUTTON_ZOOM_FACTOR = 1.25;
const FIT_MARGIN = 48;

function radiusOf(point: GraphPoint): number {
  return point.kind === "account" ? ACCOUNT_RADIUS : UNKNOWN_RADIUS;
}

// Thicker for more source stories, but slowly, so a busy pair does not hide its neighbours.
function connectionWidth(storyCount: number): number {
  return 1.5 + 1.5 * Math.log2(storyCount);
}

function readPalette(element: HTMLElement): Palette {
  const style = globalThis.getComputedStyle(element);

  function token(name: string): string {
    return style.getPropertyValue(`--${name}`).trim();
  }

  return {
    primary: token("primary"),
    primaryForeground: token("primary-foreground"),
    mutedForeground: token("muted-foreground"),
    foreground: token("foreground"),
    background: token("background"),
    ring: token("ring"),
  };
}

/** Pulls every point towards the origin, so separate groups of points never drift out of view. */
function pullToOrigin(strength: number) {
  let nodes: Array<GraphNode> = [];

  function force(alpha: number) {
    for (const node of nodes) {
      node.vx = (node.vx ?? 0) - (node.x ?? 0) * strength * alpha;
      node.vy = (node.vy ?? 0) - (node.y ?? 0) * strength * alpha;
    }
  }

  force.initialize = (all: Array<GraphNode>) => {
    nodes = all;
  };

  return force;
}

function isNode(end: GraphLink["source"]): end is GraphNode {
  return typeof end === "object";
}

function connectionAlpha(highlighted: boolean, anySelected: boolean): number {
  if (highlighted) {
    return 1;
  }

  return anySelected ? 0.15 : 0.5;
}

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
) {
  const nodes: Array<GraphNode> = points.map((point) => ({ id: point.id, point }));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const links: Array<GraphLink> = connections.map((connection) => ({
    source: connection.source,
    target: connection.target,
    connection,
  }));

  const avatars = new Map<string, HTMLImageElement>();
  let palette = readPalette(container);
  let fitted = false;
  let settled = false;
  let moved = false;
  const listeners = new globalThis.AbortController();
  const graph: Graph = new ForceGraph<GraphNode, GraphLink>(container);

  function avatarOf(path: string): HTMLImageElement | undefined {
    let image = avatars.get(path);

    if (image === undefined) {
      image = new globalThis.Image();
      image.addEventListener("load", () => {
        requestRedraw(graph);
      });
      image.src = path;
      avatars.set(path, image);
    }

    return image.complete && image.naturalWidth > 0 ? image : undefined;
  }

  function isNeighbourOfSelection(id: string): boolean {
    const { selectedPointId } = latest.current;

    return connections.some(
      ({ source, target }) =>
        (source === selectedPointId && target === id) ||
        (target === selectedPointId && source === id),
    );
  }

  function isHighlighted({ id, source, target }: GraphConnection): boolean {
    const { selectedPointId, selectedConnectionId, focusedConnectionId } = latest.current;

    return (
      id === selectedConnectionId ||
      id === focusedConnectionId ||
      source === selectedPointId ||
      target === selectedPointId
    );
  }

  function drawPoint(node: GraphNode, context: CanvasRenderingContext2D) {
    const { point } = node;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const radius = radiusOf(point);
    const { selectedPointId, hoveredPointId } = latest.current;
    const isSelected = point.id === selectedPointId;
    const dimmed = selectedPointId !== null && !isSelected && !isNeighbourOfSelection(point.id);

    context.save();
    context.globalAlpha = dimmed ? 0.3 : 1;
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fillStyle = point.kind === "account" ? palette.primary : palette.mutedForeground;
    context.fill();

    if (point.kind === "account") {
      // The initials show through wherever the photo is missing or fails to load.
      context.fillStyle = palette.primaryForeground;
      context.font = "500 12px 'Inter Variable', sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(formatUserInitials(point.username), x, y);

      const avatar = avatarOf(point.avatarPath);

      if (avatar !== undefined) {
        context.save();
        context.clip();
        const side = Math.min(avatar.naturalWidth, avatar.naturalHeight);
        context.drawImage(
          avatar,
          (avatar.naturalWidth - side) / 2,
          (avatar.naturalHeight - side) / 2,
          side,
          side,
          x - radius,
          y - radius,
          2 * radius,
          2 * radius,
        );
        context.restore();
      }
    }

    if (isSelected || point.id === hoveredPointId) {
      context.beginPath();
      context.arc(x, y, radius + 3, 0, 2 * Math.PI);
      context.lineWidth = 2.5;
      context.strokeStyle = isSelected ? palette.primary : palette.ring;
      context.stroke();
    }

    context.restore();
  }

  function drawConnection(link: GraphLink, context: CanvasRenderingContext2D) {
    const { source, target } = link;

    // force-graph swaps each end's id for its node once it has read the graph data.
    if (!isNode(source) || !isNode(target)) {
      return;
    }

    const highlighted = isHighlighted(link.connection);
    context.save();
    context.globalAlpha = connectionAlpha(highlighted, latest.current.selectedPointId !== null);
    context.strokeStyle = highlighted ? palette.primary : palette.mutedForeground;
    context.lineWidth = connectionWidth(link.connection.storyPks.length);
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(source.x ?? 0, source.y ?? 0);
    context.lineTo(target.x ?? 0, target.y ?? 0);
    context.stroke();
    context.restore();
  }

  function drawHoverLabel(context: CanvasRenderingContext2D) {
    const { hoveredPointId, selectedPointId } = latest.current;

    const node =
      hoveredPointId === null || hoveredPointId === selectedPointId
        ? undefined
        : nodesById.get(hoveredPointId);

    if (node === undefined) {
      return;
    }

    const x = node.x ?? 0;
    const y = (node.y ?? 0) - radiusOf(node.point) - 8;

    context.save();
    context.font = "500 14px 'Inter Variable', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = palette.background;
    context.strokeText(node.point.label, x, y);
    context.fillStyle = palette.foreground;
    context.fillText(node.point.label, x, y);
    context.restore();
  }

  graph
    // Sized before the first fit: force-graph otherwise starts at the window's size.
    .width(container.clientWidth)
    .height(container.clientHeight)
    .graphData({ nodes, links })
    .nodeId("id")
    .nodeLabel(() => "")
    .linkLabel(() => "")
    .nodeCanvasObject(drawPoint)
    .nodePointerAreaPaint((node, color, context) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(node.x ?? 0, node.y ?? 0, radiusOf(node.point), 0, 2 * Math.PI);
      context.fill();
    })
    .linkCanvasObject(drawConnection)
    .linkWidth((link) => connectionWidth(link.connection.storyPks.length))
    .linkHoverPrecision(CONNECTION_HIT_WIDTH / 2)
    .onRenderFramePre(() => {
      // Read on every redraw, so the drawing follows the light or dark theme.
      palette = readPalette(container);
    })
    .onRenderFramePost(drawHoverLabel)
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
  graph.d3Force("origin", pullToOrigin(0.06));

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

  // Stable per graph, so React builds force-graph once and destroys it with the element.
  const attach = useMemo(
    () =>
      function attachGraph(container: HTMLDivElement | null) {
        const created =
          container === null
            ? null
            : createGraph(container, { points, connections }, latest, setScale);

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
