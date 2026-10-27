import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  // oxlint-disable-next-line typescript/no-namespace -- React's JSX types are extended through its JSX namespace.
  namespace JSX {
    interface IntrinsicElements {
      marquee: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        behavior?: "scroll" | "slide" | "alternate";
        scrollamount?: number;
      };
    }
  }
}

export function ScrollingTitle({ children }: { children: string }) {
  return (
    <marquee
      title={children}
      behavior="alternate"
      scrollamount={2}
      className="tw:block tw:min-w-0 tw:text-xs tw:font-medium"
    >
      <span className="tw:inline-block tw:min-w-full tw:whitespace-nowrap">{children}</span>
    </marquee>
  );
}
