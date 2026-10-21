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
  return <link rel="stylesheet" href="/css/report-page.css" />;
}

export function ReportPage(props: ReportContentProps & { clientEntry?: string }) {
  const { date, clientEntry } = props;
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Rapport Stories ${date}`}</title>
        <BaseStyles />
        <ReportPageStyles />
        <ReportHeaderStyles />
        <UserSectionStyles />
        <StoryCardStyles />
        <LightboxStyles />
      </head>
      <body class="report-page">
        <div id="app">
          <ReportContent {...props} />
        </div>
        <script type="module" src={clientEntry} />
      </body>
    </html>
  );
}
