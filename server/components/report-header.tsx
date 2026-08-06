import { css, cx } from "hono/css";

type ReportHeaderProps = {
  reportKeys: string[];
  selectedReportKey: string;
};

const headerClass = css`
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

  @media (max-width: 640px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const eyebrowClass = css`
  margin: 0 0 3px;
  color: #667585;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const titleClass = css`
  margin: 0;
  font-size: 18px;
  font-weight: 680;
`;

const pickerClass = css`
  display: flex;
  align-items: center;
  gap: 10px;

  label {
    font-size: 14px;
    font-weight: 650;
  }

  select {
    min-width: 260px;
    padding: 9px 34px 9px 11px;
    border: 1px solid #b9c4d0;
    border-radius: 8px;
    background: #fff;
    color: #1f2933;
    font: inherit;
  }

  @media (max-width: 640px) {
    width: 100%;
    align-items: stretch;
    flex-direction: column;

    select {
      width: 100%;
    }
  }
`;

export function ReportHeader({
  reportKeys,
  selectedReportKey,
}: ReportHeaderProps) {
  return (
    <header class={cx("report-page-header", headerClass)}>
      <div>
        <p class={cx("report-page-header__eyebrow", eyebrowClass)}>Stories Instagram</p>
        <p class={cx("report-page-header__title", titleClass)}>Consulter un rapport</p>
      </div>
      <form class={cx("report-picker", pickerClass)} action="/report" method="get">
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
