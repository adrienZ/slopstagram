import cx from "clsx";
import { css } from "mono-jsx/jsx-runtime";

type ReportHeaderProps = {
  reportKeys: string[];
  selectedReportKey: string;
};

export const reportHeaderStyles = css`
  .report-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 0 0 30px;
    padding: 16px 18px;
    border: 1px solid #d8dee7;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(20, 30, 40, 0.08);
  }

  .report-page-header__eyebrow {
    margin: 0 0 3px;
    color: #667585;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .report-page-header__title {
    margin: 0;
    font-size: 18px;
    font-weight: 680;
  }

  .report-picker {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .report-picker label {
    font-size: 14px;
    font-weight: 650;
  }

  .report-picker select {
    min-width: 260px;
    padding: 9px 34px 9px 11px;
    border: 1px solid #b9c4d0;
    border-radius: 8px;
    background: #fff;
    color: #1f2933;
    font: inherit;
  }

  @media (max-width: 640px) {
    .report-page-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .report-picker {
      width: 100%;
      align-items: stretch;
      flex-direction: column;
    }

    .report-picker select {
      width: 100%;
    }
  }
`;

export function ReportHeaderStyles() {
  return <style>{reportHeaderStyles}</style>;
}

export function ReportHeader({ reportKeys, selectedReportKey }: ReportHeaderProps) {
  return (
    <header class={cx("report-page-header")}>
      <div>
        <p class={cx("report-page-header__eyebrow")}>Storiesss Instagram</p>
        <p class={cx("report-page-header__title")}>Consulter un rapport</p>
      </div>
      <form class={cx("report-picker")} action="/report" method="GET">
        <label for="report-picker">Rapport</label>
        <select id="report-picker" name="report" aria-label="Choisir un rapport">
          {reportKeys.map((reportKey) => (
            <option value={reportKey} selected={reportKey === selectedReportKey}>
              {reportKey.replace(/^stories-report-/u, "").replace(/\.json$/u, "")}
            </option>
          ))}
        </select>
      </form>
    </header>
  );
}
