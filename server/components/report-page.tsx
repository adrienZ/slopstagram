import { css } from "mono-jsx/jsx-runtime";
import { formatReportDate, getRankedUsers } from "../helper.ts";
import type { ReportViewModel } from "../report-view-model.ts";
import { createStoryCards } from "../story-card-view-model.ts";
import { BaseStyles } from "./base-styles.tsx";
import { Lightbox, LightboxStyles } from "./lightbox.tsx";
import { ReportHeader, ReportHeaderStyles } from "./report-header.tsx";
import { StoryCardStyles } from "./story-card.tsx";
import { UserSection, UserSectionStyles } from "./user-section.tsx";

interface ReportPageProps {
  reportKeys: Array<string>;
  selectedReportKey: string;
  viewModel: ReportViewModel;
}

function ReportPageStyles() {
  return (
    <style>{css`
      @import url("/css/report-page.css");
    `}</style>
  );
}

export function ReportPage({ reportKeys, selectedReportKey, viewModel }: ReportPageProps) {
  const { report } = viewModel;
  const date = formatReportDate(report.metadata.created_at);
  const users = getRankedUsers(report).map((user) => ({
    user,
    stories: createStoryCards(user, viewModel),
  }));
  return (
    <html lang="fr" app={{ storyMediaPk: "", stories: [] }}>
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
        <main>
          <ReportHeader reportKeys={reportKeys} selectedReportKey={selectedReportKey} />
          <h1>{`Rapport du ${date}`}</h1>
          {users.map(({ user, stories }) => (
            <UserSection user={user} viewModel={viewModel} stories={stories} />
          ))}
        </main>
        <Lightbox stories={users.flatMap((user) => user.stories)} />
      </body>
    </html>
  );
}
