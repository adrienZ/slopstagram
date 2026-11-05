import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  p: ({ children }) => <p className="tw:leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="tw:list-disc tw:space-y-1 tw:pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="tw:list-decimal tw:space-y-1 tw:pl-5">{children}</ol>,
  strong: ({ children }) => <strong className="tw:font-semibold">{children}</strong>,
};

/**
 * The Assistant's text, which the model writes as markdown. Raw HTML in it is not rendered,
 * and unsafe link targets are dropped by the renderer.
 */
export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="tw:grid tw:gap-3">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
