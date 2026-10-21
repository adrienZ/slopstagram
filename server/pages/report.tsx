import { createAsync, useLocation } from "@solidjs/router";
import type { RouteDefinition } from "@solidjs/router";
import { getReport } from "../query-service.ts";
import { Link, Title } from "@solidjs/meta";
import { BaseStyles } from "../components/base-styles.tsx";
import type { UserSectionProps } from "../components/user-section.tsx";
import { Lightbox, LightboxStyles } from "../components/lightbox.tsx";
import { ReportHeader, ReportHeaderStyles } from "../components/report-header.tsx";
import { StoryCardStyles } from "../components/story-card.tsx";
import { UserSection, UserSectionStyles } from "../components/user-section.tsx";

export interface ReportContentProps {
  date: string;
  reportKeys: Array<string>;
  selectedReportKey: string;
  users: Array<UserSectionProps>;
}

export function ReportContent({ date, reportKeys, selectedReportKey, users }: ReportContentProps) {
  return (
    <>
      <main>
        <ReportHeader reportKeys={reportKeys} selectedReportKey={selectedReportKey} />
        <h1>{`Rapport du ${date}`}</h1>
        {users.map((props) => (
          <UserSection {...props} />
        ))}
      </main>
      <Lightbox stories={users.flatMap((user) => user.stories)} />
    </>
  );
}

function ReportPageStyles() {
  return <Link rel="stylesheet" href="/css/report-page.css" />;
}

export function ReportPage(props: ReportContentProps) {
  return (
    <>
      <Title>{`Rapport Stories ${props.date}`}</Title>
      <BaseStyles />
      <ReportPageStyles />
      <ReportHeaderStyles />
      <UserSectionStyles />
      <StoryCardStyles />
      <LightboxStyles />
      <div class="report-page">
        <ReportContent {...props} />
      </div>
    </>
  );
}

export const route = {
  // oxlint-disable-next-line typescript/promise-function-async -- Preserve the query promise so the router handles preload rejections.
  preload: ({ location }) =>
    getReport(new globalThis.URLSearchParams(location.search).get("report")),
} satisfies RouteDefinition;

export default function ReportRoute() {
  const location = useLocation();
  const data = createAsync(
    // oxlint-disable-next-line typescript/promise-function-async -- createAsync must receive the query promise directly during hydration.
    () => getReport(new globalThis.URLSearchParams(location.search).get("report")),
    {
      deferStream: true,
    },
  );
  function renderPage() {
    const props = data();
    return props === undefined ? null : <ReportPage {...props} />;
  }
  return <>{renderPage()}</>;
}
