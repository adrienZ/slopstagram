import { ClientOnly } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Suspense,
  useContext,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import type { MentionGraphSelection } from "../hooks/use-mention-graph-selection.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "../shadcn/ui/popover.tsx";
import {
  formatConjunction,
  formatStoryCount,
  formatUserInitials,
  getUserTimelineUrl,
} from "../utils/helper.ts";
import {
  MentionGraphCanvasContext,
  type GraphConnection,
  type GraphPoint,
  type PointLocator,
} from "./mention-graph-canvas-context.ts";

type AccountPoint = Extract<GraphPoint, { kind: "account" }>;

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

interface MentionGraphProps extends Pick<MentionGraphPageData["graph"], "points" | "connections"> {
  selection: Pick<
    MentionGraphSelection,
    "selectedPointId" | "selectPoint" | "selectedConnectionId" | "selectConnection"
  >;
  overlay?: ReactNode;
}

/**
 * The Mention connections as a force-directed graph. The canvas draws them; a visually hidden
 * copy as buttons keeps every point and connection reachable by keyboard and screen readers.
 * Selecting a point highlights its connections and, for a known Account, opens its profile.
 */
export function MentionGraph({ points, connections, selection, overlay }: MentionGraphProps) {
  const { selectedPointId, selectPoint, selectedConnectionId, selectConnection } = selection;
  const { t } = useTranslation();
  const MentionGraphCanvas = useContext(MentionGraphCanvasContext);
  const regionRef = useRef<HTMLElement>(null);
  const locatorRef = useRef<PointLocator | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [focusedConnectionId, setFocusedConnectionId] = useState<string | null>(null);
  const selected = points.find((point) => point.id === selectedPointId);

  // Stable per selected point: Radix re-anchors on every render and would loop on a new object.
  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () =>
        (selectedPointId === null ? undefined : locatorRef.current?.(selectedPointId)) ??
        regionRef.current?.getBoundingClientRect() ??
        new globalThis.DOMRect(),
    }),
    [selectedPointId],
  );

  function isHighlighted({ id, source, target }: GraphConnection): boolean {
    return id === selectedConnectionId || source === selectedPointId || target === selectedPointId;
  }

  function clearOnEscape(event: KeyboardEvent) {
    if (event.key === "Escape") {
      selectPoint(null);
    }
  }

  return (
    <section
      ref={regionRef}
      aria-label={t("graph.title")}
      className="tw:relative tw:h-[calc(100dvh-11rem)] tw:min-h-96 tw:overflow-hidden tw:rounded-lg tw:border tw:bg-muted/20"
    >
      <fieldset aria-label={t("graph.pointsAndConnections")} className="tw:sr-only">
        <fieldset aria-label={t("graph.connections")}>
          {connections.map((connection) => (
            <button
              key={connection.id}
              type="button"
              aria-label={t("graph.connectionLabel", {
                labels: formatConjunction(connection.labels),
                stories: formatStoryCount(connection.storyPks.length),
              })}
              aria-pressed={connection.id === selectedConnectionId}
              data-highlighted={isHighlighted(connection)}
              onClick={() => {
                selectConnection(connection.id);
              }}
              onKeyDown={clearOnEscape}
              onFocus={() => {
                setFocusedConnectionId(connection.id);
              }}
              onBlur={() => {
                setFocusedConnectionId(null);
              }}
            />
          ))}
        </fieldset>
        <fieldset aria-label={t("graph.points")}>
          {points.map((point) => (
            <button
              key={point.id}
              type="button"
              aria-label={point.label}
              aria-pressed={point.id === selectedPointId}
              onClick={() => {
                selectPoint(point.id);
              }}
              onKeyDown={clearOnEscape}
              onFocus={() => {
                setHoveredPointId(point.id);
              }}
              onBlur={() => {
                setHoveredPointId(null);
              }}
            />
          ))}
        </fieldset>
      </fieldset>
      {/* force-graph reads `window` as soon as it loads, so the server leaves the canvas out. */}
      <ClientOnly>
        <Suspense>
          {/* oxlint-disable-next-line react/static-components -- Tests swap the canvas through context; it never changes between renders. */}
          <MentionGraphCanvas
            points={points}
            connections={connections}
            selectedPointId={selectedPointId}
            selectedConnectionId={selectedConnectionId}
            hoveredPointId={hoveredPointId}
            focusedConnectionId={focusedConnectionId}
            onSelectPoint={selectPoint}
            onSelectConnection={selectConnection}
            onHoverPoint={setHoveredPointId}
            locatorRef={locatorRef}
          />
        </Suspense>
      </ClientOnly>
      {overlay}
      <Popover
        open={selected?.kind === "account"}
        onOpenChange={(open) => {
          if (!open) {
            selectPoint(null);
          }
        }}
      >
        <PopoverAnchor virtualRef={{ current: anchor }} />
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
