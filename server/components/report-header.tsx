import cx from "clsx";

export function ReportHeader() {
  return (
    <header className={cx("report-page-header")}>
      <div>
        <p className={cx("report-page-header__eyebrow")}>Storiesss Instagram</p>
        <p className={cx("report-page-header__title")}>Le fil des dernières stories</p>
      </div>
      <a href="/report">Actualiser le fil</a>
    </header>
  );
}
