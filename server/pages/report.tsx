import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getReport } from "../query-service.ts";

import type { UserSectionProps } from "../components/user-section.tsx";
import { Lightbox } from "../components/lightbox.tsx";
import { ReportHeader } from "../components/report-header.tsx";
import { UserSection } from "../components/user-section.tsx";

export interface ReportContentProps {
  date: string;
  reportKeys: Array<string>;
  selectedReportKey: string;
  users: Array<UserSectionProps>;
}

export function ReportContent({
  date,
  reportKeys,
  selectedReportKey,
  users,
  selectedStory,
}: ReportContentProps & { selectedStory?: string }) {
  return (
    <>
      <main>
        <ReportHeader reportKeys={reportKeys} selectedReportKey={selectedReportKey} />
        <h1>{`Rapport du ${date}`}</h1>
        {users.map((props) => (
          <UserSection key={props.user.username} {...props} />
        ))}
      </main>
      <Lightbox stories={users.flatMap((user) => user.stories)} selectedStory={selectedStory} />
    </>
  );
}

export function ReportPage(props: ReportContentProps & { selectedStory?: string }) {
  return (
    <>
      <div className="report-page">
        <ReportContent {...props} />
      </div>
    </>
  );
}

export const Route = createFileRoute("/report")({
  validateSearch: z.object({
    report: z.coerce.string().optional(),
    story: z.coerce.string().optional(),
  }),
  loaderDeps: ({ search }) => ({ report: search.report }),
  loader: async ({ deps }) => await getReport({ data: deps.report ?? null }),
  head: ({ loaderData }) => ({
    meta: [{ title: `Rapport Stories ${loaderData?.date ?? ""}` }],
    links: ["report-page", "report-header", "user-section", "story-card", "lightbox"].map(
      (name) => ({ rel: "stylesheet", href: `/css/${name}.css` }),
    ),
  }),
  component: () => (
    <ReportPage {...Route.useLoaderData()} selectedStory={Route.useSearch().story} />
  ),
});
