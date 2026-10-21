import { atom } from "nanostores";
import type { ReportContentProps } from "./pages/report.tsx";
import type { TimelineContentProps } from "./pages/users/[username].tsx";

export type AppData =
  | { page: "report"; props: ReportContentProps }
  | { page: "timeline"; props: TimelineContentProps };

export const $page = atom<AppData | null>(null);
export const $storyMediaPk = atom("");
