export function ReportHeader() {
  return (
    <header className="tw:mb-7.5 tw:flex tw:items-center tw:justify-between tw:gap-5 tw:rounded-xl tw:border tw:border-border tw:bg-card tw:px-4.5 tw:py-4 tw:text-card-foreground tw:shadow-[0_1px_3px_rgb(20_30_40_/_0.08)] tw:max-[640px]:flex-col tw:max-[640px]:items-start">
      <div>
        <p className="tw:mb-0.75 tw:text-xs tw:leading-normal tw:font-bold tw:tracking-[0.08em] tw:text-muted-foreground tw:uppercase">
          Storiesss Instagram
        </p>
        <p className="tw:text-lg tw:leading-normal tw:font-[680]">Le fil des dernières stories</p>
      </div>
    </header>
  );
}
