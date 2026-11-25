import { useTranslation } from "react-i18next";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "cn";
import { LocateFixedIcon, MinusIcon, PlusIcon } from "lucide-react";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import type { LayoutPosition } from "@@/core/domains/mention-connections/force-simulation.ts";
import { useForceLayout } from "../hooks/use-force-layout.ts";
import { toTransform, useGraphPainter } from "../hooks/use-graph-painter.ts";
import type { MentionGraphSelection } from "../hooks/use-mention-graph-selection.ts";
import { GRAPH_HEIGHT, GRAPH_WIDTH, useGraphViewport } from "../hooks/use-graph-viewport.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "../shadcn/ui/popover.tsx";
import {
  formatConjunction,
  formatStoryCount,
  formatUserInitials,
  getUserTimelineUrl,
} from "../utils/helper.ts";

type GraphPoint = MentionGraphPageData["graph"]["points"][number];

type AccountPoint = Extract<GraphPoint, { kind: "account" }>;

type GraphConnection = MentionGraphPageData["graph"]["connections"][number];

const ACCOUNT_RADIUS = 20;
const UNKNOWN_RADIUS = 7;
const CONNECTION_HIT_WIDTH = 14;

function radiusOf(point: GraphPoint): number {
  return point.kind === "account" ? ACCOUNT_RADIUS : UNKNOWN_RADIUS;
}

// Thicker for more source stories, but slowly, so a busy pair does not hide its neighbours.
function connectionWidth(storyCount: number): number {
  return 1.5 + 1.5 * Math.log2(storyCount);
}

function activationHandlers(isClick: () => boolean, action: () => void) {
  return {
    onClick: (event: MouseEvent) => {
      event.stopPropagation();

      if (isClick()) {
        action();
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action();
      }
    },
  };
}

function AccountProfile({ point }: { point: AccountPoint }) {
  const { t } = useTranslation();

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
        <a href={getUserTimelineUrl(point.username)}>{t("graph.viewProfile")}</a>
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
  const { t } = useTranslation();

  return (
    <div
      role="toolbar"
      aria-label={t("graph.controls")}
      className="tw:absolute tw:right-3 tw:bottom-3 tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:bg-background tw:p-1 tw:shadow-sm"
    >
      <Button variant="ghost" size="icon" aria-label={t("graph.zoomOut")} onClick={onZoomOut}>
        <MinusIcon aria-hidden="true" />
      </Button>
      <output aria-label={t("graph.zoomLevel")} className="tw:w-12 tw:text-center tw:text-xs">
        {`${Math.round(scale * 100)} %`}
      </output>
      <Button variant="ghost" size="icon" aria-label={t("graph.zoomIn")} onClick={onZoomIn}>
        <PlusIcon aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={t("graph.recenter")} onClick={onRecenter}>
        <LocateFixedIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

interface MentionGraphProps extends Pick<MentionGraphPageData["graph"], "points" | "connections"> {
  selection: Pick<
    MentionGraphSelection,
    "selectedPointId" | "selectPoint" | "selectedConnectionId" | "selectConnection"
  >;
  overlay?: ReactNode;
}

/**
 * The Mention connections as a force-directed graph: points can be dragged, the background
 * panned, and the view zoomed. Selecting a point highlights its connections and, for a known
 * Account, opens its profile.
 */
export function MentionGraph({ points, connections, selection, overlay }: MentionGraphProps) {
  const { selectedPointId, selectPoint, selectedConnectionId, selectConnection } = selection;
  const { t } = useTranslation();
  const regionRef = useRef<HTMLElement>(null);
  const layout = useForceLayout(points, connections);
  const { trackPoint, trackLabel, trackConnection } = useGraphPainter(layout, connections);

  const { attach, view, startPan, startPointDrag, isClick, zoomIn, zoomOut, recenter } =
    useGraphViewport(layout);

  const clipPathId = useId();
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<SVGGElement | null>(null);
  const pointsById = new Map(points.map((point) => [point.id, point]));
  const selected = selectedPointId === null ? undefined : pointsById.get(selectedPointId);

  const neighbours = new Set<string>(
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

  function isHighlighted({ id, source, target }: GraphConnection): boolean {
    return id === selectedConnectionId || source === selectedPointId || target === selectedPointId;
  }

  function positionOf(id: string): LayoutPosition {
    return layout.getPositions().get(id) ?? { x: 0, y: 0 };
  }

  function renderConnection(connection: GraphConnection): ReactNode {
    const source = positionOf(connection.source);
    const target = positionOf(connection.target);
    const highlighted = isHighlighted(connection);
    const storyCount = connection.storyPks.length;
    const line = { x1: source.x, y1: source.y, x2: target.x, y2: target.y };

    return (
      <g
        key={connection.id}
        ref={(element) => {
          trackConnection(connection.id, element);
        }}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG has no <button>.
        role="button"
        tabIndex={0}
        aria-label={t("graph.connectionLabel", {
          labels: formatConjunction(connection.labels),
          stories: formatStoryCount(storyCount),
        })}
        aria-pressed={connection.id === selectedConnectionId}
        data-highlighted={highlighted}
        className="tw:cursor-pointer tw:outline-none"
        {...activationHandlers(isClick, () => {
          selectConnection(connection.id);
        })}
      >
        <line
          {...line}
          strokeWidth={connectionWidth(storyCount)}
          strokeLinecap="round"
          className={cn({
            "tw:stroke-primary": highlighted,
            "tw:stroke-muted-foreground/50": !highlighted && selectedPointId === null,
            "tw:stroke-muted-foreground/15": !highlighted && selectedPointId !== null,
          })}
        />
        <line {...line} strokeWidth={CONNECTION_HIT_WIDTH} className="tw:stroke-transparent" />
      </g>
    );
  }

  function renderPoint(point: GraphPoint): ReactNode {
    const { x, y } = positionOf(point.id);
    const isSelected = point.id === selectedPointId;
    const dimmed = selectedPointId !== null && !isSelected && !neighbours.has(point.id);

    return (
      <g
        key={point.id}
        ref={(element) => {
          trackPoint(point.id, element);

          if (isSelected) {
            setSelectedElement(element);
          }
        }}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG has no <button>.
        role="button"
        tabIndex={0}
        aria-label={point.label}
        aria-pressed={isSelected}
        transform={toTransform({ x, y })}
        className={cn(
          "tw:cursor-grab tw:outline-none tw:transition-opacity tw:active:cursor-grabbing",
          dimmed && "tw:opacity-30",
        )}
        onPointerDown={(event) => {
          startPointDrag(event, point.id);
        }}
        {...activationHandlers(isClick, () => {
          selectPoint(point.id);
        })}
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
          r={radiusOf(point) + 3}
          fill="none"
          strokeWidth={2.5}
          className={isSelected ? "tw:stroke-primary" : "tw:stroke-transparent"}
        />
      </g>
    );
  }

  function renderHoverLabel(point: GraphPoint): ReactNode {
    return (
      <text
        ref={(element) => {
          trackLabel(point.id, element);
        }}
        role="tooltip"
        transform={toTransform(positionOf(point.id))}
        y={-radiusOf(point) - 8}
        textAnchor="middle"
        className="tw:pointer-events-none tw:fill-foreground tw:stroke-background tw:stroke-3 tw:text-sm tw:font-medium tw:[paint-order:stroke]"
      >
        {point.label}
      </text>
    );
  }

  return (
    <section
      ref={regionRef}
      aria-label={t("graph.title")}
      className="tw:relative tw:h-[calc(100dvh-11rem)] tw:min-h-96 tw:overflow-hidden tw:rounded-lg tw:border tw:bg-muted/20"
    >
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The canvas pans on drag and clears the selection on Escape. */}
      <svg
        ref={attach}
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG has no <fieldset>.
        role="group"
        aria-label={t("graph.pointsAndConnections")}
        className="tw:size-full tw:cursor-move tw:touch-none tw:select-none"
        onPointerDown={(event) => {
          startPan(event);
        }}
        onClick={() => {
          if (isClick()) {
            selectPoint(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            selectPoint(null);
          }
        }}
      >
        <defs>
          <clipPath id={clipPathId} clipPathUnits="objectBoundingBox">
            <circle cx={0.5} cy={0.5} r={0.5} />
          </clipPath>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG has no <fieldset>. */}
          <g role="group" aria-label={t("graph.connections")}>
            {connections.map(renderConnection)}
          </g>
          {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG has no <fieldset>. */}
          <g role="group" aria-label={t("graph.points")}>
            {points.map(renderPoint)}
          </g>
          {hovered !== undefined && renderHoverLabel(hovered)}
        </g>
      </svg>
      <GraphControls
        scale={view.scale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onRecenter={recenter}
      />
      {overlay}
      <Popover
        open={selected?.kind === "account"}
        onOpenChange={(open) => {
          if (!open) {
            selectPoint(null);
          }
        }}
      >
        {selectedElement !== null && <PopoverAnchor virtualRef={{ current: selectedElement }} />}
        {selected?.kind === "account" && (
          <PopoverContent
            aria-label={t("graph.profileOf", { name: selected.label })}
            className="tw:w-64"
            side="top"
            updatePositionStrategy="always"
            onFocusOutside={(event) => {
              // Focus moves into the story modal, which opens over the profile, not instead of it.
              event.preventDefault();
            }}
            onInteractOutside={(event) => {
              // Inside the graph, its own click handlers decide what a click selects or clears.
              if (
                event.target instanceof globalThis.Node &&
                regionRef.current?.contains(event.target) === true
              ) {
                event.preventDefault();
              }
            }}
          >
            <AccountProfile point={selected} />
          </PopoverContent>
        )}
      </Popover>
    </section>
  );
}
