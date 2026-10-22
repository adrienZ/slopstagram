import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getReport } from "../query-service.ts";

import type { UserSectionProps } from "../components/user-section.tsx";
import { Lightbox } from "../components/lightbox.tsx";
import { ReportHeader } from "../components/report-header.tsx";
import { UserSection } from "../components/user-section.tsx";

export interface ReportContentProps {
  date: string;
  users: Array<UserSectionProps>;
}

export function ReportContent({
  date,
  users,
  selectedStory,
}: ReportContentProps & { selectedStory?: string }) {
  return (
    <>
      <main>
        <ReportHeader />
        <h1>Stories des dernières 24 heures</h1>
        <p>{`Fil chargé le ${date}`}</p>
        {users.length === 0 && <p>Aucune story publiée dans les dernières 24 heures.</p>}
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
    story: z.coerce.string().optional(),
  }),
  loader: async () => await getReport(),
  staleTime: Infinity,
  head: () => ({
    meta: [{ title: "Stories des dernières 24 heures" }],
    links: ["report-page", "report-header", "user-section", "story-card", "lightbox"].map(
      (name) => ({ rel: "stylesheet", href: `/css/${name}.css` }),
    ),
  }),
  component: () => (
    <ReportPage {...Route.useLoaderData()} selectedStory={Route.useSearch().story} />
  ),
});
