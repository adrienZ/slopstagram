import { useStore } from "@nanostores/preact";
import { $page } from "./store.ts";
import { ReportContent } from "../server/pages/report-page.tsx";
import type { ReportContentProps } from "../server/pages/report-page.tsx";
import { TimelineContent } from "../server/pages/user-timeline-page.tsx";
import type { TimelineContentProps } from "../server/pages/user-timeline-page.tsx";

export type AppData =
  | { page: "report"; props: ReportContentProps }
  | { page: "timeline"; props: TimelineContentProps };

export function App() {
  const data = useStore($page);
  if (data === null) {
    return null;
  }
  return data.page === "report" ? (
    <ReportContent {...data.props} />
  ) : (
    <TimelineContent {...data.props} />
  );
}
