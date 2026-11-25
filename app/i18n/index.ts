import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json" with { type: "json" };

export const DEFAULT_LANGUAGE = "fr";

type Translation = typeof fr;

const lazyLocales = {
  en: async (): Promise<Translation> => {
    const { default: en } = await import("./locales/en.json", { with: { type: "json" } });

    return en;
  },
};

export type Language = typeof DEFAULT_LANGUAGE | keyof typeof lazyLocales;

export const i18n = createInstance();

// The default locale is bundled, so init resolves synchronously and server and client render the same text.
void i18n.use(initReactI18next).init({
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  resources: { [DEFAULT_LANGUAGE]: { translation: fr } },
  interpolation: { escapeValue: false },
  initAsync: false,
});

// Not used by the app until a language switcher exists.
/** @public */
export async function changeLanguage(language: Language) {
  if (language !== DEFAULT_LANGUAGE && !i18n.hasResourceBundle(language, "translation")) {
    i18n.addResourceBundle(language, "translation", await lazyLocales[language]());
  }

  await i18n.changeLanguage(language);
}

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Translation };
  }
}
