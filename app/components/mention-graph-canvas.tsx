import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { GRAPH_HEIGHT, GRAPH_WIDTH, useForceGraph } from "../hooks/use-force-graph.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "../shadcn/ui/popover.tsx";
import { formatUserInitials, getUserTimelineUrl } from "../utils/helper.ts";

export interface MentionGraphCanvasProps extends MentionGraphPageData {
  selectedNodeId: string | undefined;
  onSelectNode: (id?: string) => void;
  onSelectConnection?: (id: string) => void;
}

export function MentionGraphCanvas({
  nodes,
  connections,
  selectedNodeId,
  onSelectNode,
  onSelectConnection,
}: MentionGraphCanvasProps) {
  const graph = useForceGraph({ nodes, connections });
  const labels = new Map(nodes.map(({ id, label }) => [id, label]));
  return (
    <div
      role="region"
      aria-label="Graphe des mentions"
      className="tw:relative tw:h-full tw:min-h-120 tw:w-full tw:overflow-hidden tw:rounded-lg tw:border tw:bg-muted/20"
    >
      <svg
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        className="tw:h-full tw:min-h-120 tw:w-full tw:touch-none"
        aria-label="Zone de déplacement du graphe"
        onPointerDown={graph.startPan}
        onPointerMove={graph.move}
        onPointerUp={graph.release}
        onPointerCancel={graph.release}
        onLostPointerCapture={graph.release}
        onClick={() => {
          if (graph.acceptClick()) {
            onSelectNode();
          }
        }}
        ref={graph.bindWheel}
      >
        <rect
          width={GRAPH_WIDTH}
          height={GRAPH_HEIGHT}
          fill="transparent"
          role="button"
          tabIndex={0}
          aria-label="Désélectionner les points"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              onSelectNode();
            }
          }}
        />
        <g
          role="group"
          aria-label="Points et connexions"
          data-zoom={graph.view.zoom}
          transform={`translate(${graph.view.x} ${graph.view.y}) scale(${graph.view.zoom})`}
        >
          {connections.map((connection) => {
            const source = graph.positions.get(connection.source);
            const target = graph.positions.get(connection.target);
            if (!source || !target) {
              return null;
            }
            const highlighted =
              connection.source === selectedNodeId || connection.target === selectedNodeId;
            return (
              <g
                key={connection.id}
                role="button"
                tabIndex={0}
                aria-label={`Connexion ${labels.get(connection.source)} et ${labels.get(connection.target)} : ${connection.storyCount} stories`}
                aria-pressed={highlighted}
                className="tw:cursor-pointer tw:outline-none"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectConnection?.(connection.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectConnection?.(connection.id);
                  }
                }}
              >
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="transparent"
                  strokeWidth={18}
                />
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="currentColor"
                  strokeWidth={1 + Math.log2(connection.storyCount + 1)}
                  className={cn({
                    "tw:text-primary": highlighted,
                    "tw:text-muted-foreground/35": !highlighted,
                  })}
                />
              </g>
            );
          })}
          {nodes.map((node) => {
            const point = graph.positions.get(node.id);
            if (!point) {
              return null;
            }
            const button = (
              <button
                type="button"
                aria-label={node.label}
                aria-pressed={selectedNodeId === node.id}
                title={node.label}
                className={cn(
                  "tw:flex tw:size-12 tw:touch-none tw:cursor-grab tw:items-center tw:justify-center tw:rounded-full tw:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-ring",
                  selectedNodeId === node.id && "tw:ring-2 tw:ring-primary",
                )}
                onPointerDown={(event) => {
                  graph.startNode(event, node.id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (graph.acceptClick()) {
                    onSelectNode(node.id);
                  }
                }}
              >
                {node.kind === "account" ? (
                  <Avatar className="tw:size-11">
                    <AvatarImage src={node.avatarPath} alt="" />
                    <AvatarFallback>{formatUserInitials(node.username)}</AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="tw:size-3 tw:rounded-full tw:bg-muted-foreground" />
                )}
              </button>
            );
            return (
              <foreignObject
                key={node.id}
                x={point.x - 24}
                y={point.y - 24}
                width={48}
                height={48}
                overflow="visible"
              >
                {node.kind === "account" ? (
                  <Popover
                    open={selectedNodeId === node.id}
                    onOpenChange={(open) => {
                      if (!open) {
                        onSelectNode();
                      }
                    }}
                  >
                    <PopoverAnchor asChild>{button}</PopoverAnchor>
                    <PopoverContent
                      aria-label={`Profil ${node.label}`}
                      className="tw:w-64"
                      onOpenAutoFocus={(event) => {
                        event.preventDefault();
                      }}
                      onInteractOutside={(event) => {
                        event.preventDefault();
                      }}
                    >
                      <div className="tw:flex tw:items-center tw:gap-3">
                        <Avatar className="tw:size-12">
                          <AvatarImage src={node.avatarPath} alt="" />
                          <AvatarFallback>{formatUserInitials(node.username)}</AvatarFallback>
                        </Avatar>
                        <div className="tw:min-w-0">
                          <p className="tw:truncate tw:font-medium">
                            {node.fullName !== null && node.fullName.length > 0
                              ? node.fullName
                              : node.label}
                          </p>
                          <p className="tw:truncate tw:text-sm tw:text-muted-foreground">
                            {node.label}
                          </p>
                        </div>
                      </div>
                      <Button asChild variant="link" className="tw:mt-2 tw:px-0">
                        <a href={getUserTimelineUrl(node.username)}>Voir le profil</a>
                      </Button>
                    </PopoverContent>
                  </Popover>
                ) : (
                  button
                )}
              </foreignObject>
            );
          })}
        </g>
      </svg>
      <div
        aria-label="Commandes du graphe"
        className="tw:absolute tw:right-3 tw:bottom-3 tw:flex tw:gap-1 tw:rounded-lg tw:border tw:bg-background tw:p-1"
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom avant"
          onClick={() => {
            graph.zoom(1.25);
          }}
        >
          <PlusIcon data-icon="inline-start" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom arrière"
          onClick={() => {
            graph.zoom(0.8);
          }}
        >
          <MinusIcon data-icon="inline-start" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Recentrer le graphe"
          onClick={graph.recenter}
        >
          <MaximizeIcon data-icon="inline-start" />
        </Button>
      </div>
    </div>
  );
}
