import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "cn";
import { LocateFixedIcon, MinusIcon, PlusIcon } from "lucide-react";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { useForceLayout, type LayoutPosition } from "../hooks/use-force-layout.ts";
import { GRAPH_HEIGHT, GRAPH_WIDTH, useGraphViewport } from "../hooks/use-graph-viewport.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "../shadcn/ui/popover.tsx";
import { formatUserInitials, getUserTimelineUrl } from "../utils/helper.ts";

type GraphPoint = MentionGraphPageData["points"][number];
type AccountPoint = Extract<GraphPoint, { kind: "account" }>;
type GraphConnection = MentionGraphPageData["connections"][number];

const ACCOUNT_RADIUS = 20;
const UNKNOWN_RADIUS = 7;

function formatStoryCount(count: number): string {
  return `${count} ${count > 1 ? "stories" : "story"}`;
}

// Thicker for more source stories, but slowly, so a busy pair does not hide its neighbours.
function connectionWidth(storyCount: number): number {
  return 1.5 + 1.5 * Math.log2(storyCount);
}

function onActivate(event: KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

function AccountProfile({ point }: { point: AccountPoint }) {
  return (
    <>
      <div className="tw:flex tw:items-center tw:gap-3">
        <Avatar size="lg">
          <AvatarImage src={point.avatarPath} alt="" />
          <AvatarFallback>{formatUserInitials(point.username)}</AvatarFallback>
        </Avatar>
        <div className="tw:min-w-0">
          {point.fullName !== null && point.fullName !== "" && (
            <p className="tw:truncate tw:font-medium">{point.fullName}</p>
          )}
          <p className="tw:truncate tw:text-muted-foreground">{point.label}</p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={getUserTimelineUrl(point.username)}>Voir le profil</a>
      </Button>
    </>
  );
}

function PointMark({ point, clipPathId }: { point: GraphPoint; clipPathId: string }) {
  if (point.kind === "unknown") {
    return <circle r={UNKNOWN_RADIUS} className="tw:fill-muted-foreground" />;
  }
  // The initials show through wherever the photo is missing or fails to load.
  return (
    <>
      <circle r={ACCOUNT_RADIUS} className="tw:fill-primary" />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        className="tw:fill-primary-foreground tw:text-xs tw:font-medium"
      >
        {formatUserInitials(point.username)}
      </text>
      <image
        href={point.avatarPath}
        x={-ACCOUNT_RADIUS}
        y={-ACCOUNT_RADIUS}
        width={2 * ACCOUNT_RADIUS}
        height={2 * ACCOUNT_RADIUS}
        clipPath={`url(#${clipPathId})`}
        preserveAspectRatio="xMidYMid slice"
      />
    </>
  );
}

function GraphControls({
  scale,
  onZoomIn,
  onZoomOut,
  onRecenter,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Commandes du graphe"
      className="tw:absolute tw:right-3 tw:bottom-3 tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:bg-background tw:p-1 tw:shadow-sm"
    >
      <Button variant="ghost" size="icon" aria-label="Zoom arrière" onClick={onZoomOut}>
        <MinusIcon aria-hidden="true" />
      </Button>
      <output aria-label="Niveau de zoom" className="tw:w-12 tw:text-center tw:text-xs">
        {`${Math.round(scale * 100)} %`}
      </output>
      <Button variant="ghost" size="icon" aria-label="Zoom avant" onClick={onZoomIn}>
        <PlusIcon aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Recentrer le graphe" onClick={onRecenter}>
        <LocateFixedIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

interface MentionGraphProps extends MentionGraphPageData {
  selectedPointId: string | null;
  onSelectPoint: (id: string | null) => void;
}

/**
 * The Mention connections as a force-directed graph: points can be dragged, the background
 * panned, and the view zoomed. Selecting a point highlights its connections and, for a known
 * Account, opens its profile.
 */
export function MentionGraph({
  points,
  connections,
  selectedPointId,
  onSelectPoint,
}: MentionGraphProps) {
  const layout = useForceLayout(points, connections);
  const viewport = useGraphViewport(layout);
  const clipPathId = useId();
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<SVGGElement | null>(null);
  const pointsById = new Map(points.map((point) => [point.id, point]));
  const selected = selectedPointId === null ? undefined : pointsById.get(selectedPointId);
  const neighbours = new Set(
    connections.flatMap(({ source, target }) => {
      if (source === selectedPointId) {
        return [target];
      }
      return target === selectedPointId ? [source] : [];
    }),
  );
  const hovered =
    hoveredPointId === null || hoveredPointId === selectedPointId
      ? undefined
      : pointsById.get(hoveredPointId);

  function isHighlighted({ source, target }: GraphConnection): boolean {
    return source === selectedPointId || target === selectedPointId;
  }

  function positionOf(id: string): LayoutPosition {
    return layout.positions.get(id) ?? { x: 0, y: 0 };
  }

  function renderConnection(connection: GraphConnection): ReactNode {
    const source = positionOf(connection.source);
    const target = positionOf(connection.target);
    const labels = [connection.source, connection.target].map((id) => pointsById.get(id)?.label);
    const highlighted = isHighlighted(connection);
    return (
      <line
        key={connection.id}
        role="img"
        aria-label={`Connexion entre ${labels.join(" et ")} : ${formatStoryCount(connection.storyCount)}`}
        data-highlighted={highlighted}
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        strokeWidth={connectionWidth(connection.storyCount)}
        strokeLinecap="round"
        className={cn({
          "tw:stroke-primary": highlighted,
          "tw:stroke-muted-foreground/50": selectedPointId === null,
          "tw:stroke-muted-foreground/15": selectedPointId !== null && !highlighted,
        })}
      />
    );
  }

  function renderPoint(point: GraphPoint): ReactNode {
    const { x, y } = positionOf(point.id);
    const isSelected = point.id === selectedPointId;
    const dimmed = selectedPointId !== null && !isSelected && !neighbours.has(point.id);
    return (
      <g
        key={point.id}
        ref={isSelected ? setSelectedElement : undefined}
        role="button"
        tabIndex={0}
        aria-label={point.label}
        aria-pressed={isSelected}
        transform={`translate(${x} ${y})`}
        className={cn(
          "tw:cursor-grab tw:outline-none tw:transition-opacity tw:active:cursor-grabbing",
          dimmed && "tw:opacity-30",
        )}
        onPointerDown={(event) => {
          viewport.startPointDrag(event, point.id);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (viewport.isClick()) {
            onSelectPoint(point.id);
          }
        }}
        onKeyDown={(event) => {
          onActivate(event, () => {
            onSelectPoint(point.id);
          });
        }}
        onPointerEnter={() => {
          setHoveredPointId(point.id);
        }}
        onPointerLeave={() => {
          setHoveredPointId(null);
        }}
        onFocus={() => {
          setHoveredPointId(point.id);
        }}
        onBlur={() => {
          setHoveredPointId(null);
        }}
      >
        <PointMark point={point} clipPathId={clipPathId} />
        <circle
          r={(point.kind === "account" ? ACCOUNT_RADIUS : UNKNOWN_RADIUS) + 3}
          fill="none"
          strokeWidth={2.5}
          className={isSelected ? "tw:stroke-primary" : "tw:stroke-transparent"}
        />
      </g>
    );
  }

  function renderHoverLabel(point: GraphPoint): ReactNode {
    const { x, y } = positionOf(point.id);
    const radius = point.kind === "account" ? ACCOUNT_RADIUS : UNKNOWN_RADIUS;
    return (
      <text
        role="tooltip"
        x={x}
        y={y - radius - 8}
        textAnchor="middle"
        className="tw:pointer-events-none tw:fill-foreground tw:stroke-background tw:stroke-[3px] tw:text-sm tw:font-medium tw:[paint-order:stroke]"
      >
        {point.label}
      </text>
    );
  }

  return (
    <div
      role="region"
      aria-label="Graphe des mentions"
      className="tw:relative tw:h-[calc(100dvh-11rem)] tw:min-h-96 tw:overflow-hidden tw:rounded-lg tw:border tw:bg-muted/20"
    >
      <svg
        ref={viewport.attach}
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        role="group"
        aria-label="Points et connexions"
        className="tw:size-full tw:cursor-move tw:touch-none tw:select-none"
        onPointerDown={viewport.startPan}
        onClick={() => {
          if (viewport.isClick()) {
            onSelectPoint(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onSelectPoint(null);
          }
        }}
      >
        <defs>
          <clipPath id={clipPathId} clipPathUnits="objectBoundingBox">
            <circle cx={0.5} cy={0.5} r={0.5} />
          </clipPath>
        </defs>
        <g
          transform={`translate(${viewport.view.x} ${viewport.view.y}) scale(${viewport.view.scale})`}
        >
          <g>{connections.map(renderConnection)}</g>
          <g>{points.map(renderPoint)}</g>
          {hovered !== undefined && renderHoverLabel(hovered)}
        </g>
      </svg>
      <GraphControls
        scale={viewport.view.scale}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onRecenter={viewport.recenter}
      />
      <Popover
        open={selected?.kind === "account"}
        onOpenChange={(open) => {
          if (!open) {
            onSelectPoint(null);
          }
        }}
      >
        {selectedElement !== null && <PopoverAnchor virtualRef={{ current: selectedElement }} />}
        {selected?.kind === "account" && (
          <PopoverContent
            aria-label={`Profil de ${selected.label}`}
            className="tw:w-64"
            side="top"
            updatePositionStrategy="always"
            onInteractOutside={(event) => {
              // Inside the graph, its own click handlers decide what a click selects or clears.
              if (
                event.target instanceof globalThis.Node &&
                selectedElement?.ownerSVGElement?.contains(event.target) === true
              ) {
                event.preventDefault();
              }
            }}
          >
            <AccountProfile point={selected} />
          </PopoverContent>
        )}
      </Popover>
    </div>
  );
}
