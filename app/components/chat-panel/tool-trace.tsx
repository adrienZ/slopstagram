import type { ReactNode } from "react";
import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "../../shadcn/ui/trace.tsx";

export type AssistantPart = AssistantUIMessage["parts"][number];
export type ToolPart = Extract<AssistantPart, { type: `tool-${string}` }>;

function getToolStatus(state: ToolPart["state"]): "error" | "running" | undefined {
  if (state === "output-error" || state === "output-denied") {
    return "error";
  }
  return state === "output-available" ? undefined : "running";
}

/**
 * A tool call as one trace line, the tool's name and what it was asked, which opens on what the
 * tool read once it has run.
 */
export function ToolTrace({
  children,
  icon,
  part,
}: {
  children?: ReactNode;
  icon: ReactNode;
  part: ToolPart;
}) {
  const line = (
    <TraceLine status={getToolStatus(part.state)}>
      <TraceIcon>{icon}</TraceIcon>
      <TraceTitle>{part.type.slice("tool-".length)}</TraceTitle>
      {/* What the Assistant asked the tool. */}
      <TraceDescription className="tw:min-w-0 tw:shrink tw:truncate tw:font-mono tw:text-xs">
        {JSON.stringify(part.input ?? {})}
      </TraceDescription>
    </TraceLine>
  );
  if (children === undefined) {
    return line;
  }
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>{children}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
