type ReportHeaderProps = {
  reportKeys: string[];
  selectedReportKey: string;
};

export function ReportHeader({
  reportKeys,
  selectedReportKey,
}: ReportHeaderProps) {
  return (
    <header class="report-page-header">
      <div>
        <p class="report-page-header__eyebrow">Stories Instagram</p>
        <p class="report-page-header__title">Consulter un rapport</p>
      </div>
      <form class="report-picker" action="/report" method="get">
        <label for="report-picker">Rapport</label>
        <select id="report-picker" name="report" aria-label="Choisir un rapport">
          {reportKeys.map((reportKey) => (
            <option value={reportKey} selected={reportKey === selectedReportKey}>
              {reportKey.replace(/^stories-report-/, "").replace(/\.json$/, "")}
            </option>
          ))}
        </select>
      </form>
    </header>
  );
}
