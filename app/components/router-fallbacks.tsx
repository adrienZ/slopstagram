import { useTranslation } from "react-i18next";

export function InternalError() {
  const { t } = useTranslation();

  return <h1>{t("errors.internal")}</h1>;
}

export function NotFound() {
  const { t } = useTranslation();

  return <h1>{t("errors.notFound")}</h1>;
}
