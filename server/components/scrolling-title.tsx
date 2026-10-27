import { createElement } from "react";

export function ScrollingTitle({ children }: { children: string }) {
  return createElement(
    "marquee",
    {
      title: children,
      behavior: "alternate",
      scrollamount: "2",
      className: "tw:block tw:min-w-0 tw:text-xs tw:font-medium",
    },
    <span className="tw:inline-block tw:min-w-full tw:whitespace-nowrap">{children}</span>,
  );
}
