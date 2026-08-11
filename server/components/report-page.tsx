import { css, js } from "mono-jsx/jsx-runtime";
import { formatReportDate, getRankedUsers, lightboxScript, reportPickerScript } from "../helper.ts";
import type { ReportViewModel } from "../report-view-model.ts";
import { Lightbox, LightboxStyles } from "./lightbox.tsx";
import { ReportHeader, ReportHeaderStyles } from "./report-header.tsx";
import { StoryCardStyles } from "./story-card.tsx";
import { UserSection, UserSectionStyles } from "./user-section.tsx";

type ReportPageProps = {
  reportKeys: string[];
  selectedReportKey: string;
  viewModel: ReportViewModel;
};

const reportPageStyles = css`
  :root {
    color-scheme: light dark;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    background: #f6f7f9;
    color: #1f2933;
  }

  body {
    margin: 0;
    background: #f6f7f9;
    color: #1f2933;
  }

  main {
    max-width: 1440px;
    margin: auto;
    padding: 32px 24px 48px;
  }

  h1 {
    font-size: 28px;
    margin: 0 0 28px;
  }

  h2 {
    font-size: 21px;
    margin: 0 0 9px;
  }

  @media (max-width: 760px) {
    main {
      padding: 24px 16px;
    }
  }
`;

function ReportPageStyles() {
  return <style>{reportPageStyles}</style>;
}

export function ReportPage({ reportKeys, selectedReportKey, viewModel }: ReportPageProps) {
  const { report } = viewModel;
  const date = formatReportDate(report.metadata.created_at);
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Rapport Stories ${date}`}</title>
        <ReportPageStyles />
        <ReportHeaderStyles />
        <UserSectionStyles />
        <StoryCardStyles />
        <LightboxStyles />
      </head>
      <body class="report-page">
        <main>
          <ReportHeader reportKeys={reportKeys} selectedReportKey={selectedReportKey} />
          <h1>{`Rapport du ${date}`}</h1>
          {getRankedUsers(report).map((user) => (
            <UserSection user={user} viewModel={viewModel} />
          ))}
        </main>
        <Lightbox />
        <script>{js(reportPickerScript)}</script>
        <script>{js(lightboxScript)}</script>
      </body>
    </html>
  );
}
