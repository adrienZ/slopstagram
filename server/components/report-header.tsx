import cx from "clsx";

export interface ReportHeaderProps {
  reportKeys: Array<string>;
  selectedReportKey: string;
}

export function ReportHeader({ reportKeys, selectedReportKey }: ReportHeaderProps) {
  return (
    <header className={cx("report-page-header")}>
      <div>
        <p className={cx("report-page-header__eyebrow")}>Storiesss Instagram</p>
        <p className={cx("report-page-header__title")}>Consulter un rapport</p>
        <a className="report-chat-link" href="/chat">
          Ouvrir le chat ↗
        </a>
      </div>
      <form className={cx("report-picker")} action="/report" method="get">
        <label htmlFor="report-picker">
          <span>Choisir un rapport</span>
          <select
            id="report-picker"
            name="report"
            defaultValue={selectedReportKey}
            onChange={(event) => {
              event.currentTarget.form?.requestSubmit();
            }}
          >
            {reportKeys.map((reportKey) => (
              <option key={reportKey} value={reportKey}>
                {reportKey.replace(/^stories-report-/u, "").replace(/\.json$/u, "")}
              </option>
            ))}
          </select>
        </label>
      </form>
    </header>
  );
}
