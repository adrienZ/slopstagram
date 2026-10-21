import { css } from "mono-jsx/jsx-runtime";
import cx from "clsx";

interface ReportHeaderProps {
  reportKeys: Array<string>;
  selectedReportKey: string;
}

export function ReportHeaderStyles() {
  return (
    <style>{css`
      @import url("/css/report-header.css");
    `}</style>
  );
}

export function ReportHeader({ reportKeys, selectedReportKey }: ReportHeaderProps) {
  return (
    <header class={cx("report-page-header")}>
      <div>
        <p class={cx("report-page-header__eyebrow")}>Storiesss Instagram</p>
        <p class={cx("report-page-header__title")}>Consulter un rapport</p>
      </div>
      <form class={cx("report-picker")} action="/report" method="GET">
        <label for="report-picker">
          <span>Choisir un rapport</span>
          <select
            id="report-picker"
            name="report"
            onChange={(event) => {
              event.target.form?.requestSubmit();
            }}
          >
            {reportKeys.map((reportKey) => (
              <option value={reportKey} selected={reportKey === selectedReportKey}>
                {reportKey.replace(/^stories-report-/u, "").replace(/\.json$/u, "")}
              </option>
            ))}
          </select>
        </label>
      </form>
    </header>
  );
}
