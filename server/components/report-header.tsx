import { cn } from "cn";

export function ReportHeader() {
  return (
    <header className={cn("report-page-header")}>
      <div>
        <p className={cn("report-page-header__eyebrow")}>Storiesss Instagram</p>
        <p className={cn("report-page-header__title")}>Le fil des dernières stories</p>
      </div>
      <a href="/report">Actualiser le fil</a>
    </header>
  );
}
