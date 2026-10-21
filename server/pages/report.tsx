import { getRequestEvent } from "solid-js/web";
import { $page } from "../store.ts";
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

export default function ReportRoute() {
  const data = getRequestEvent()?.locals.page ?? $page.get();
  if (data?.page !== "report") {
    throw new Error("Report data could not be loaded");
  }
  return <ReportPage {...data.props} />;
}
