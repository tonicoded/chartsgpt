// Fill these in once and the whole site (home + blog CTAs) will update.
// Tip: keep the domain without a trailing slash, e.g. "https://chartsgpt.com"
window.CHARTSGPT_CONFIG = {
  siteUrl: "https://charts-gpt.com",
  appStoreUrl: "https://apps.apple.com/app/chartsgpt-trading-assistant/id6758857719",
  playStoreUrl: "https://play.google.com/store/apps/details?id=YOUR.PACKAGE.NAME",

  // Android beta waitlist -> Supabase (project "chartsgpt").
  // The publishable key is safe to ship in the browser: row level security
  // only allows INSERT into public.android_waitlist, never SELECT.
  supabaseUrl: "https://ufzdahsxleztgvioqwwi.supabase.co",
  supabaseAnonKey: "sb_publishable_Qe7fcj1_UmhPJ7mo698cnA_-j-klqNV",
  waitlistTable: "android_waitlist"
};
