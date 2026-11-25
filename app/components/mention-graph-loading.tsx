import { LoaderCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Shown over the graph until its first frame: on the server, while force-graph loads, and while the layout warms up. */
export function MentionGraphLoading() {
  const { t } = useTranslation();

  return (
    <output className="tw:pointer-events-none tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-sm tw:text-muted-foreground">
      <LoaderCircleIcon aria-hidden="true" className="tw:size-4 tw:animate-spin" />
      {t("graph.loading")}
    </output>
  );
}
