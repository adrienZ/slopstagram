import { createContext, lazy } from "react";
import type { ComponentType, RefObject } from "react";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";

export type GraphPoint = MentionGraphPageData["graph"]["points"][number];

export type GraphConnection = MentionGraphPageData["graph"]["connections"][number];

/** Where a point is drawn on screen, so a popover can follow it while the graph moves. */
export type PointLocator = (id: string) => DOMRect | undefined;

export interface MentionGraphCanvasProps {
  points: Array<GraphPoint>;
  connections: Array<GraphConnection>;
  selectedPointId: string | null;
  selectedConnectionId: string | null;
  hoveredPointId: string | null;
  focusedConnectionId: string | null;
  onSelectPoint: (id: string | null) => void;
  onSelectConnection: (id: string) => void;
  onHoverPoint: (id: string | null) => void;
  locatorRef: RefObject<PointLocator | null>;
}

/** The canvas the mention graph draws on, which tests replace since jsdom has no canvas. */
export const MentionGraphCanvasContext = createContext<ComponentType<MentionGraphCanvasProps>>(
  lazy(async () => await import("./mention-graph-canvas.tsx")),
);
