import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { fr, type Translation } from "./locales/fr.ts";

const DEFAULT_LANGUAGE = "fr";

const lazyLocales = {
  en: async () => {
    const { en } = await import("./locales/en.ts");

    return en;
  },
};

type Language = typeof DEFAULT_LANGUAGE | keyof typeof lazyLocales;

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
