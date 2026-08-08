import fs from "node:fs";
import path from "node:path";

const sourceRoot = process.argv[2] || "/Users/anthonyverruijt/Downloads/ChartGPT 6/AppStore/metadata";
const outputFile = path.join(process.cwd(), "app/_lib/additional-locales.generated.json");

const localeConfig = [
  ["ar-SA", "ar", "ar-SA", "ar", "العربية", "ar_SA", "rtl"],
  ["ca", "ca", "ca", "ca", "Català", "ca_ES"],
  ["cs", "cs", "cs", "cs", "Čeština", "cs_CZ"],
  ["da", "da", "da", "da", "Dansk", "da_DK"],
  ["de-DE", "de", "de-DE", "de", "Deutsch", "de_DE"],
  ["el", "el", "el", "el", "Ελληνικά", "el_GR"],
  ["en-AU", "en-au", "en-AU", "en", "English (Australia)", "en_AU"],
  ["en-CA", "en-ca", "en-CA", "en", "English (Canada)", "en_CA"],
  ["en-GB", "en-gb", "en-GB", "en", "English (UK)", "en_GB"],
  ["en-US", "", "en-US", "en", "English (US)", "en_US"],
  ["es-ES", "es", "es-ES", "es", "Español (España)", "es_ES"],
  ["es-MX", "es-mx", "es-MX", "es", "Español (México)", "es_MX"],
  ["fi", "fi", "fi", "fi", "Suomi", "fi_FI"],
  ["fr-CA", "fr-ca", "fr-CA", "fr", "Français (Canada)", "fr_CA"],
  ["fr-FR", "fr", "fr-FR", "fr", "Français (France)", "fr_FR"],
  ["he", "he", "he", "he", "עברית", "he_IL", "rtl"],
  ["hi", "hi", "hi", "hi", "हिन्दी", "hi_IN"],
  ["hr", "hr", "hr", "hr", "Hrvatski", "hr_HR"],
  ["hu", "hu", "hu", "hu", "Magyar", "hu_HU"],
  ["id", "id", "id", "id", "Bahasa Indonesia", "id_ID"],
  ["it", "it", "it", "it", "Italiano", "it_IT"],
  ["ja", "ja", "ja", "ja", "日本語", "ja_JP"],
  ["ko", "ko", "ko", "ko", "한국어", "ko_KR"],
  ["ms", "ms", "ms", "ms", "Bahasa Melayu", "ms_MY"],
  ["nl-NL", "nl", "nl-NL", "nl", "Nederlands", "nl_NL"],
  ["no", "no", "no", "no", "Norsk", "nb_NO"],
  ["pl", "pl", "pl", "pl", "Polski", "pl_PL"],
  ["pt-BR", "pt-br", "pt-BR", "pt", "Português (Brasil)", "pt_BR"],
  ["pt-PT", "pt-pt", "pt-PT", "pt", "Português (Portugal)", "pt_PT"],
  ["ro", "ro", "ro", "ro", "Română", "ro_RO"],
  ["ru", "ru", "ru", "ru", "Русский", "ru_RU"],
  ["sk", "sk", "sk", "sk", "Slovenčina", "sk_SK"],
  ["sv", "sv", "sv", "sv", "Svenska", "sv_SE"],
  ["th", "th", "th", "th", "ไทย", "th_TH"],
  ["tr", "tr", "tr", "tr", "Türkçe", "tr_TR"],
  ["uk", "uk", "uk", "uk", "Українська", "uk_UA"],
  ["vi", "vi", "vi", "vi", "Tiếng Việt", "vi_VN"],
  ["zh-Hans", "zh-hans", "zh-Hans", "zh-Hans", "简体中文", "zh_CN"],
  ["zh-Hant", "zh-hant", "zh-Hant", "zh-Hant", "繁體中文", "zh_TW"]
];

const handAuthoredRoutes = new Set(["ar", "de", "es", "fr", "hi", "nl", "ru", "zh-hans"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function truncate(value, limit) {
  const chars = Array.from(String(value || "").trim());
  if (chars.length <= limit) return chars.join("");
  const clipped = chars.slice(0, limit - 1).join("");
  const lastSpace = clipped.lastIndexOf(" ");
  return `${lastSpace > limit * 0.65 ? clipped.slice(0, lastSpace) : clipped}…`;
}

function parseFeature(line) {
  const clean = line.replace(/^•\s*/, "").trim();
  const parts = clean.split(/\s+[—–-]\s+/, 2);
  return { title: parts[0] || clean, text: parts[1] || clean };
}

function buildContent(config) {
  const [sourceLocale, code, hreflang, lang, label, ogLocale, dir] = config;
  const version = readJson(path.join(sourceRoot, "version/3.5", `${sourceLocale}.json`));
  const appInfo = readJson(path.join(sourceRoot, "app-info", `${sourceLocale}.json`));
  const blocks = version.description.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const bulletBlockIndex = blocks.findIndex((part) => part.includes("•"));
  const bulletBlock = bulletBlockIndex >= 0 ? blocks[bulletBlockIndex] : "";
  const bulletLines = bulletBlock.split("\n").filter((line) => line.trim().startsWith("•")).map(parseFeature);
  const featureHeading = bulletBlock.split("\n").find((line) => !line.trim().startsWith("•"))?.trim() || appInfo.subtitle;
  const marketsBlock = blocks[bulletBlockIndex + 1] || "";
  const marketLines = marketsBlock.split("\n").filter(Boolean);
  const marketsTitle = marketLines.length > 1 ? marketLines[0] : appInfo.subtitle;
  const marketsText = marketLines.length > 1 ? marketLines.slice(1).join(" ") : marketsBlock;
  const disclaimer = blocks[bulletBlockIndex + 2] || "ChartsGPT is for education and analysis only and is not financial advice.";
  const localName = appInfo.name.replace(/^ChartsGPT\s*[:：]\s*/i, "").trim();
  const titleCandidate = `${appInfo.name} | ${appInfo.subtitle}`;

  return {
    code,
    hreflang,
    lang,
    ...(dir ? { dir } : {}),
    label,
    ogLocale,
    title: truncate(titleCandidate, 60),
    description: truncate(version.promotionalText, 158),
    keywords: version.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean),
    menu: "Menu",
    trust: "4.9 · App Store",
    audience: appInfo.subtitle,
    heroLead: localName,
    heroMiddle: "ChartsGPT",
    heroAccent: appInfo.subtitle,
    phrases: bulletLines.slice(0, 3).map((feature) => feature.text),
    appStoreLabel: "ChartsGPT · App Store",
    androidLabel: "Sign up for the Android Beta",
    androidTitle: "Join the Android beta",
    androidText: "ChartsGPT is currently available for iPhone and iPad. The Android version is in development — join the waitlist to get in first.",
    iosInstead: "Download for iOS",
    introTitle: appInfo.name,
    introText: blocks.slice(0, Math.max(2, bulletBlockIndex)).join(" "),
    features: bulletLines.slice(0, 4),
    howTitle: featureHeading,
    steps: bulletLines.slice(4, 7),
    marketsTitle,
    marketsText,
    faqTitle: "",
    faqs: [],
    ctaTitle: appInfo.subtitle,
    ctaText: version.promotionalText,
    disclaimer,
    languageLabel: "Language",
    footerLinks: { blog: "Blog", privacy: "Privacy", terms: "Terms", support: "Support" }
  };
}

const additionalLocales = Object.fromEntries(
  localeConfig
    .filter((config) => config[1] && !handAuthoredRoutes.has(config[1]))
    .map((config) => [config[1], buildContent(config)])
);

fs.writeFileSync(outputFile, `${JSON.stringify(additionalLocales, null, 2)}\n`);
console.log(`Generated ${Object.keys(additionalLocales).length} additional website locales at ${outputFile}`);
