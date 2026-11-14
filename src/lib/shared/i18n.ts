/**
 * Languages a traveller can pick. `code` is what Nexconn's built-in translation
 * expects as a target language; `label` is shown in the language's own script.
 */
export const LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "hi", label: "हिन्दी", dir: "ltr" },
  { code: "bn", label: "বাংলা", dir: "ltr" },
  { code: "ta", label: "தமிழ்", dir: "ltr" },
  { code: "te", label: "తెలుగు", dir: "ltr" },
  { code: "mr", label: "मराठी", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "de", label: "Deutsch", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "zh", label: "中文", dir: "ltr" },
  { code: "ja", label: "日本語", dir: "ltr" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export function isLanguage(code: unknown): code is LanguageCode {
  return typeof code === "string" && LANGUAGES.some((l) => l.code === code);
}

/** Best supported language from an Accept-Language header, defaulting to English. */
export function pickLanguage(acceptLanguage: string | null | undefined): LanguageCode {
  if (!acceptLanguage) return "en";
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { base: tag.toLowerCase().split("-")[0] ?? "", q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { base } of ranked) if (isLanguage(base)) return base;
  return "en";
}
