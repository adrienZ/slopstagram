import { css, Style } from "hono/css";
import {
  formatReportDate,
  getRankedUsers,
  lightboxScript,
  reportPickerScript,
} from "../helper.ts";
import type { ReportViewModel } from "../report-view-model.ts";
import { Lightbox } from "./lightbox.tsx";
import { ReportHeader } from "./report-header.tsx";
import { UserSection } from "./user-section.tsx";

type ReportPageProps = {
  reportKeys: string[];
  selectedReportKey: string;
  viewModel: ReportViewModel;
};

const pageClass = css`
  :-hono-global {
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
  }
`;

export function ReportPage({
  reportKeys,
  selectedReportKey,
  viewModel,
}: ReportPageProps) {
  const { report } = viewModel;
  const date = formatReportDate(report.metadata.created_at);
  return (
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Rapport Stories ${date}`}</title>
        <Style />
      </head>
      <body class={pageClass}>
        <main>
          <ReportHeader
            reportKeys={reportKeys}
            selectedReportKey={selectedReportKey}
          />
          <h1>{`Rapport du ${date}`}</h1>
          {getRankedUsers(report).map((user) => <UserSection user={user} viewModel={viewModel} />)}
        </main>
        <Lightbox />
        <script dangerouslySetInnerHTML={{ __html: reportPickerScript }} />
        <script dangerouslySetInnerHTML={{ __html: lightboxScript }} />
      </body>
    </html>
  );
}
