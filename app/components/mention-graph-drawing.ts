import type { LinkObject, NodeObject } from "force-graph";
import { formatUserInitials } from "../utils/helper.ts";
import type {
  GraphConnection,
  GraphPoint,
  MentionGraphCanvasProps,
} from "./mention-graph-canvas-props.ts";

export interface GraphNode extends NodeObject {
  id: string;
  point: GraphPoint;
}

export interface GraphLink extends LinkObject<GraphNode> {
  connection: GraphConnection;
}

interface Palette {
  primary: string;
  primaryForeground: string;
  mutedForeground: string;
  foreground: string;
  background: string;
  ring: string;
}

/** What one frame draws from: the selection and the theme's colours. */
export type Scene = Pick<
  MentionGraphCanvasProps,
  "selectedPointId" | "selectedConnectionId" | "hoveredPointId" | "focusedConnectionId"
> & { palette: Palette };

const ACCOUNT_RADIUS = 20;
const UNKNOWN_RADIUS = 7;

export function radiusOf(point: GraphPoint): number {
  return point.kind === "account" ? ACCOUNT_RADIUS : UNKNOWN_RADIUS;
}

// Thicker for more source stories, but slowly, so a busy pair does not hide its neighbours.
export function connectionWidth(storyCount: number): number {
  return 1.5 + 1.5 * Math.log2(storyCount);
}

export function readPalette(element: HTMLElement): Palette {
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

function isNode(end: GraphLink["source"]): end is GraphNode {
  return typeof end === "object";
}

function connectionAlpha(highlighted: boolean, anySelected: boolean): number {
  if (highlighted) {
    return 1;
  }

  return anySelected ? 0.15 : 0.5;
}

function isHighlighted({ id, source, target }: GraphConnection, scene: Scene): boolean {
  return (
    id === scene.selectedConnectionId ||
    id === scene.focusedConnectionId ||
    source === scene.selectedPointId ||
    target === scene.selectedPointId
  );
}

function drawAvatar(context: CanvasRenderingContext2D, avatar: HTMLImageElement, node: GraphNode) {
  const radius = radiusOf(node.point);
  const side = Math.min(avatar.naturalWidth, avatar.naturalHeight);

  context.save();
  context.clip();
  context.drawImage(
    avatar,
    (avatar.naturalWidth - side) / 2,
    (avatar.naturalHeight - side) / 2,
    side,
    side,
    (node.x ?? 0) - radius,
    (node.y ?? 0) - radius,
    2 * radius,
    2 * radius,
  );
  context.restore();
}

export function drawConnection(link: GraphLink, context: CanvasRenderingContext2D, scene: Scene) {
  const { source, target } = link;

  // force-graph swaps each end's id for its node once it has read the graph data.
  if (!isNode(source) || !isNode(target)) {
    return;
  }

  const highlighted = isHighlighted(link.connection, scene);
  context.save();
  context.globalAlpha = connectionAlpha(highlighted, scene.selectedPointId !== null);
  context.strokeStyle = highlighted ? scene.palette.primary : scene.palette.mutedForeground;
  context.lineWidth = connectionWidth(link.connection.storyPks.length);
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(source.x ?? 0, source.y ?? 0);
  context.lineTo(target.x ?? 0, target.y ?? 0);
  context.stroke();
  context.restore();
}

/**
 * Draws points and the hover label onto force-graph's canvas. Avatars load on first use;
 * `onAvatarLoad` asks for the frame that shows them.
 */
export function createPainter(
  connections: ReadonlyArray<GraphConnection>,
  nodesById: ReadonlyMap<string, GraphNode>,
  onAvatarLoad: () => void,
) {
  const avatars = new Map<string, HTMLImageElement>();

  function avatarOf(path: string): HTMLImageElement | undefined {
    let image = avatars.get(path);

    if (image === undefined) {
      image = new globalThis.Image();
      image.addEventListener("load", onAvatarLoad);
      image.src = path;
      avatars.set(path, image);
    }

    return image.complete && image.naturalWidth > 0 ? image : undefined;
  }

  function isNeighbourOfSelection(id: string, { selectedPointId }: Scene): boolean {
    return connections.some(
      ({ source, target }) =>
        (source === selectedPointId && target === id) ||
        (target === selectedPointId && source === id),
    );
  }

  function drawPoint(node: GraphNode, context: CanvasRenderingContext2D, scene: Scene) {
    const { point } = node;
    const { palette } = scene;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const radius = radiusOf(point);
    const isSelected = point.id === scene.selectedPointId;

    const dimmed =
      scene.selectedPointId !== null && !isSelected && !isNeighbourOfSelection(point.id, scene);

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
        drawAvatar(context, avatar, node);
      }
    }

    if (isSelected || point.id === scene.hoveredPointId) {
      context.beginPath();
      context.arc(x, y, radius + 3, 0, 2 * Math.PI);
      context.lineWidth = 2.5;
      context.strokeStyle = isSelected ? palette.primary : palette.ring;
      context.stroke();
    }

    context.restore();
  }

  function drawHoverLabel(context: CanvasRenderingContext2D, scene: Scene) {
    const { hoveredPointId, selectedPointId, palette } = scene;

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

  return { drawPoint, drawHoverLabel };
}
