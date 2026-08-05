import {
  formatReportDate,
  getRankedUsers,
  lightboxScript,
  reportCss,
  reportHeaderCss,
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
        <style dangerouslySetInnerHTML={{ __html: reportCss }} />
        <style dangerouslySetInnerHTML={{ __html: reportHeaderCss }} />
      </head>
      <body>
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
