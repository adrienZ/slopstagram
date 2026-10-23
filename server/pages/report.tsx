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
      <ReportHeader />
      <h1 className="tw:mb-7 tw:text-[28px] tw:font-bold">Stories des dernières 24 heures</h1>
      <p className="tw:my-4">{`Fil chargé le ${date}`}</p>
      {users.length === 0 && (
        <p className="tw:my-4">Aucune story publiée dans les dernières 24 heures.</p>
      )}
      {users.map((props) => (
        <UserSection key={props.user.username} {...props} />
      ))}
      <Lightbox stories={users.flatMap((user) => user.stories)} selectedStory={selectedStory} />
    </>
  );
}

export function ReportPage(props: ReportContentProps & { selectedStory?: string }) {
  return <ReportContent {...props} />;
}

export const Route = createFileRoute("/report")({
  validateSearch: z.object({
    story: z.coerce.string().optional(),
  }),
  loader: async () => await getReport(),
  staleTime: Infinity,
  head: () => ({
    meta: [{ title: "Stories des dernières 24 heures" }],
  }),
  component: () => (
    <ReportPage {...Route.useLoaderData()} selectedStory={Route.useSearch().story} />
  ),
});
