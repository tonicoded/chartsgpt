import additionalLocales from "./additional-locales.generated.json";

export const SITE_URL = "https://charts-gpt.com";
export const APP_STORE_URL = "https://apps.apple.com/app/chartsgpt-trading-assistant/id6758857719";

export type LocaleCode = string;

type Feature = { title: string; text: string };
type Faq = { question: string; answer: string };

/** Copy for the "Sign up for the Android Beta" button + waitlist modal. */
export type BetaCopy = {
  kicker: string;
  badge: string;
  ariaLabel: string;
  modalTitle: string;
  modalText: string;
  emailLabel: string;
  placeholder: string;
  submit: string;
  sending: string;
  done: string;
  already: string;
  invalid: string;
  error: string;
  fineprint: string;
};

export const BETA_COPY_DEFAULT: BetaCopy = {
  kicker: "Sign up for the",
  badge: "Android Beta",
  ariaLabel: "Sign up for the ChartsGPT Android beta",
  modalTitle: "Join the Android beta",
  modalText:
    "We're building the Android version now. Drop your email and you'll be first in line when the beta opens.",
  emailLabel: "Email address",
  placeholder: "you@example.com",
  submit: "Join the waitlist",
  sending: "Sending…",
  done: "You're on the list. We'll email you when the beta opens.",
  already: "You're already on the list — we'll be in touch.",
  invalid: "Please enter a valid email address.",
  error: "Something went wrong. Please try again.",
  fineprint: "We'll only email you about the Android beta. No spam, unsubscribe anytime."
};

/** Locale copy falls back to English for anything not translated yet. */
export function betaCopy(content: LocaleContent): BetaCopy {
  return { ...BETA_COPY_DEFAULT, ...(content.beta ?? {}) };
}

export type LocaleContent = {
  code: LocaleCode;
  hreflang: string;
  lang: string;
  dir?: "rtl";
  label: string;
  ogLocale: string;
  title: string;
  description: string;
  keywords: string[];
  menu: string;
  trust: string;
  audience: string;
  heroLead: string;
  heroMiddle: string;
  heroAccent: string;
  phrases: string[];
  appStoreLabel: string;
  androidLabel: string;
  androidTitle: string;
  androidText: string;
  iosInstead: string;
  beta?: Partial<BetaCopy>;
  introTitle: string;
  introText: string;
  features: Feature[];
  howTitle: string;
  steps: Feature[];
  marketsTitle: string;
  marketsText: string;
  faqTitle: string;
  faqs: Faq[];
  ctaTitle: string;
  ctaText: string;
  disclaimer: string;
  languageLabel: string;
  footerLinks: { blog: string; privacy: string; terms: string; support: string };
};

const coreLocales: Record<LocaleCode, LocaleContent> = {
  es: {
    code: "es",
    hreflang: "es-ES",
    lang: "es",
    label: "Español",
    ogLocale: "es_ES",
    title: "Analizador de gráficos con IA para trading | ChartsGPT",
    description: "Analiza capturas de gráficos de criptomonedas, forex y acciones con IA. Obtén tendencia, niveles clave, entrada, stop loss e invalidación en segundos.",
    keywords: ["analizador de gráficos con IA", "análisis técnico IA", "analizar gráfico trading", "señales de trading IA", "análisis crypto", "análisis forex"],
    menu: "Menú",
    trust: "4,9 en App Store",
    audience: "Para traders activos",
    heroLead: "Analiza tu gráfico.",
    heroMiddle: "Obtén un",
    heroAccent: "plan de trading.",
    phrases: [
      "Niveles clave, sesgo, entrada, stop loss e invalidación.",
      "Funciona con cripto, forex, acciones y metales.",
      "Una segunda opinión clara en cuestión de segundos."
    ],
    appStoreLabel: "Descargar ChartsGPT en App Store",
    androidLabel: "Google Play: próximamente",
    androidTitle: "Android está en camino",
    androidText: "Estamos desarrollando la versión para Android. ChartsGPT está disponible actualmente en iPhone y iPad.",
    iosInstead: "Descargar para iOS",
    beta: {
      kicker: "Apúntate a la",
      badge: "Beta de Android",
      ariaLabel: "Apúntate a la beta de Android de ChartsGPT",
      modalTitle: "Únete a la beta de Android",
      modalText: "Estamos desarrollando la versión para Android. Déjanos tu correo y serás de los primeros en probar la beta.",
      emailLabel: "Correo electrónico",
      placeholder: "tu@ejemplo.com",
      submit: "Unirme a la lista",
      sending: "Enviando…",
      done: "Ya estás en la lista. Te avisaremos cuando abra la beta.",
      already: "Ya estabas en la lista: te escribiremos pronto.",
      invalid: "Introduce un correo electrónico válido.",
      error: "Algo ha salido mal. Inténtalo de nuevo.",
      fineprint: "Solo te escribiremos sobre la beta de Android. Sin spam, puedes darte de baja cuando quieras."
    },
    introTitle: "Análisis técnico con IA a partir de una captura",
    introText: "Sube una captura de TradingView o de cualquier plataforma. ChartsGPT identifica la dirección de la tendencia, la estructura del mercado, soportes, resistencias y escenarios posibles sin obligarte a configurar herramientas complejas.",
    features: [
      { title: "Niveles y estructura", text: "Detecta soportes, resistencias, rupturas, cambios de estructura y zonas relevantes." },
      { title: "Plan con riesgo", text: "Recibe posibles entradas, stop loss, take profit, invalidación y notas de riesgo para revisar." },
      { title: "Indicadores y patrones", text: "Interpreta RSI, MACD, medias móviles, breakouts, dobles techos y otros patrones habituales." },
      { title: "Contexto de mercado", text: "Añade noticias, calendario macro, sesiones y conversación con AI Coach para ampliar el análisis." }
    ],
    howTitle: "Cómo analizar un gráfico con ChartsGPT",
    steps: [
      { title: "1. Sube una captura", text: "Elige una imagen clara con el activo, el marco temporal y las velas visibles." },
      { title: "2. Revisa el análisis", text: "Comprueba el sesgo, los niveles, los patrones y los escenarios alcista y bajista." },
      { title: "3. Valida tu plan", text: "Usa la entrada, el stop y la invalidación como segunda opinión, no como asesoramiento financiero." }
    ],
    marketsTitle: "Cripto, forex, acciones y metales",
    marketsText: "ChartsGPT sirve tanto para day trading como para swing trading. Analiza Bitcoin, altcoins, pares de divisas, índices, acciones, oro y plata siempre que la captura muestre suficiente contexto.",
    faqTitle: "Preguntas frecuentes",
    faqs: [
      { question: "¿ChartsGPT da señales de compra o venta?", answer: "ChartsGPT genera análisis y escenarios informativos. No ejecuta operaciones ni sustituye tu propio criterio, gestión de riesgo o investigación." },
      { question: "¿Qué captura produce el mejor análisis?", answer: "Usa una imagen nítida, sin ventanas que tapen el gráfico, e incluye el símbolo, el marco temporal y suficiente historial de precios." },
      { question: "¿Puedo analizar forex y criptomonedas?", answer: "Sí. La app admite gráficos de cripto, forex, acciones, índices y metales, con enfoques para day trading y swing trading." }
    ],
    ctaTitle: "Convierte una captura en un plan más claro",
    ctaText: "Descarga ChartsGPT para iPhone o iPad y analiza tu próximo gráfico en segundos.",
    disclaimer: "ChartsGPT ofrece información educativa y no asesoramiento financiero. Investiga por tu cuenta antes de tomar decisiones de inversión.",
    languageLabel: "Idioma",
    footerLinks: { blog: "Blog", privacy: "Privacidad", terms: "Términos", support: "Soporte" }
  },
  nl: {
    code: "nl",
    hreflang: "nl-NL",
    lang: "nl",
    label: "Nederlands",
    ogLocale: "nl_NL",
    title: "AI grafiek analyser voor trading | ChartsGPT",
    description: "Analyseer screenshots van crypto-, forex- en aandelengrafieken met AI. Krijg trend, belangrijke niveaus, entry, stop loss en invalidatie in seconden.",
    keywords: ["AI grafiek analyser", "trading grafiek analyseren", "technische analyse AI", "crypto analyse app", "forex grafiek analyse", "trading signalen AI"],
    menu: "Menu",
    trust: "4,9 in de App Store",
    audience: "Voor actieve traders",
    heroLead: "Scan je grafiek.",
    heroMiddle: "Krijg een",
    heroAccent: "tradingplan.",
    phrases: [
      "Belangrijke niveaus, bias, entry, stop loss en invalidatie.",
      "Voor crypto, forex, aandelen en metalen.",
      "Binnen enkele seconden een duidelijke tweede mening."
    ],
    appStoreLabel: "Download ChartsGPT in de App Store",
    androidLabel: "Google Play: binnenkort beschikbaar",
    androidTitle: "Android komt eraan",
    androidText: "We werken aan de Android-versie. ChartsGPT is nu beschikbaar voor iPhone en iPad.",
    iosInstead: "Download voor iOS",
    beta: {
      kicker: "Meld je aan voor de",
      badge: "Android Beta",
      ariaLabel: "Meld je aan voor de ChartsGPT Android-beta",
      modalTitle: "Doe mee aan de Android-beta",
      modalText: "We werken aan de Android-versie. Laat je e-mailadres achter en je bent als eerste aan de beurt zodra de beta opengaat.",
      emailLabel: "E-mailadres",
      placeholder: "jij@voorbeeld.nl",
      submit: "Zet me op de wachtlijst",
      sending: "Versturen…",
      done: "Je staat op de lijst. We mailen je zodra de beta start.",
      already: "Je staat al op de lijst — we houden je op de hoogte.",
      invalid: "Vul een geldig e-mailadres in.",
      error: "Er ging iets mis. Probeer het opnieuw.",
      fineprint: "We mailen alleen over de Android-beta. Geen spam, altijd afmelden mogelijk."
    },
    introTitle: "Technische analyse met AI vanuit één screenshot",
    introText: "Upload een screenshot uit TradingView of een ander handelsplatform. ChartsGPT herkent trendrichting, marktstructuur, steun, weerstand en mogelijke scenario’s zonder ingewikkelde instellingen.",
    features: [
      { title: "Niveaus en structuur", text: "Vind steun, weerstand, breakouts, structure breaks en zones die aandacht verdienen." },
      { title: "Plan met risicokaders", text: "Bekijk mogelijke entries, stop loss, take profit, invalidatie en duidelijke risiconotities." },
      { title: "Indicatoren en patronen", text: "Krijg context bij RSI, MACD, moving averages, dubbele toppen, bodems en andere patronen." },
      { title: "Meer marktcontext", text: "Combineer analyses met nieuws, macrodata, handelssessies en extra uitleg van AI Coach." }
    ],
    howTitle: "Zo analyseer je een grafiek met ChartsGPT",
    steps: [
      { title: "1. Upload een screenshot", text: "Gebruik een scherpe afbeelding waarop het instrument, de timeframe en de candles zichtbaar zijn." },
      { title: "2. Controleer de analyse", text: "Bekijk bias, niveaus, patronen en zowel het bullish als bearish scenario." },
      { title: "3. Valideer je plan", text: "Gebruik entry, stop en invalidatie als tweede mening, niet als financieel advies." }
    ],
    marketsTitle: "Crypto, forex, aandelen en metalen",
    marketsText: "ChartsGPT is geschikt voor day trading en swing trading. Analyseer Bitcoin, altcoins, valutaparen, indices, aandelen, goud en zilver wanneer je screenshot genoeg prijscontext bevat.",
    faqTitle: "Veelgestelde vragen",
    faqs: [
      { question: "Geeft ChartsGPT koop- of verkoopsignalen?", answer: "ChartsGPT maakt informatieve analyses en scenario’s. De app plaatst geen trades en vervangt je eigen onderzoek en risicobeheer niet." },
      { question: "Welk screenshot geeft het beste resultaat?", answer: "Kies een scherpe afbeelding zonder overlappende vensters en laat het symbool, de timeframe en voldoende koershistorie zien." },
      { question: "Kan ik forex en crypto analyseren?", answer: "Ja. ChartsGPT ondersteunt grafieken van crypto, forex, aandelen, indices en metalen voor day- en swingtrading." }
    ],
    ctaTitle: "Maak van een screenshot een duidelijker plan",
    ctaText: "Download ChartsGPT voor iPhone of iPad en analyseer je volgende grafiek in enkele seconden.",
    disclaimer: "ChartsGPT biedt educatieve informatie en geen financieel advies. Doe altijd zelf onderzoek voordat je beleggingsbeslissingen neemt.",
    languageLabel: "Taal",
    footerLinks: { blog: "Blog", privacy: "Privacy", terms: "Voorwaarden", support: "Support" }
  },
  de: {
    code: "de",
    hreflang: "de-DE",
    lang: "de",
    label: "Deutsch",
    ogLocale: "de_DE",
    title: "KI-Chartanalyse für Trading | ChartsGPT",
    description: "Analysiere Screenshots von Krypto-, Forex- und Aktiencharts mit KI. Erhalte Trend, Schlüsselzonen, Einstieg, Stop-Loss und Invalidierung in Sekunden.",
    keywords: ["KI Chartanalyse", "Trading Chart analysieren", "technische Analyse KI", "Krypto Analyse App", "Forex Chartanalyse", "Trading Signale KI"],
    menu: "Menü",
    trust: "4,9 im App Store",
    audience: "Für aktive Trader",
    heroLead: "Chart scannen.",
    heroMiddle: "Tradingplan",
    heroAccent: "erhalten.",
    phrases: ["Schlüsselzonen, Bias, Einstieg, Stop-Loss und Invalidierung.", "Für Krypto, Forex, Aktien und Metalle.", "Eine klare zweite Einschätzung in wenigen Sekunden."],
    appStoreLabel: "ChartsGPT im App Store laden",
    androidLabel: "Google Play: demnächst",
    androidTitle: "Android ist in Arbeit",
    androidText: "Wir entwickeln die Android-Version. ChartsGPT ist derzeit für iPhone und iPad verfügbar.",
    iosInstead: "Für iOS laden",
    beta: {
      kicker: "Anmelden für die",
      badge: "Android-Beta",
      ariaLabel: "Für die ChartsGPT Android-Beta anmelden",
      modalTitle: "Zur Android-Beta anmelden",
      modalText: "Wir entwickeln gerade die Android-Version. Trag deine E-Mail ein und du bist beim Beta-Start als Erstes dabei.",
      emailLabel: "E-Mail-Adresse",
      placeholder: "du@beispiel.de",
      submit: "Auf die Warteliste",
      sending: "Wird gesendet…",
      done: "Du stehst auf der Liste. Wir melden uns zum Beta-Start.",
      already: "Du stehst bereits auf der Liste — wir melden uns.",
      invalid: "Bitte gib eine gültige E-Mail-Adresse ein.",
      error: "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
      fineprint: "Wir schreiben dir nur zur Android-Beta. Kein Spam, jederzeit abbestellbar."
    },
    introTitle: "Technische KI-Analyse aus einem Screenshot",
    introText: "Lade einen Screenshot aus TradingView oder einer anderen Plattform hoch. ChartsGPT erkennt Trendrichtung, Marktstruktur, Unterstützungen, Widerstände und mögliche Szenarien – ohne komplizierte Einrichtung.",
    features: [
      { title: "Zonen und Struktur", text: "Erkenne Unterstützung, Widerstand, Ausbrüche, Strukturwechsel und relevante Preiszonen." },
      { title: "Risikobewusster Plan", text: "Prüfe mögliche Einstiege, Stop-Loss, Take-Profit, Invalidierung und Risikohinweise." },
      { title: "Indikatoren und Muster", text: "Ordne RSI, MACD, gleitende Durchschnitte, Doppeltops und weitere Chartmuster ein." },
      { title: "Marktkontext", text: "Erweitere die Analyse mit Nachrichten, Makrokalender, Sessions und Erklärungen des AI Coach." }
    ],
    howTitle: "So analysierst du einen Chart mit ChartsGPT",
    steps: [
      { title: "1. Screenshot hochladen", text: "Nutze ein scharfes Bild mit sichtbarem Symbol, Zeitrahmen und Kursverlauf." },
      { title: "2. Analyse prüfen", text: "Kontrolliere Bias, Schlüsselzonen, Muster sowie bullische und bärische Szenarien." },
      { title: "3. Plan validieren", text: "Nutze Einstieg, Stop und Invalidierung als zweite Einschätzung, nicht als Finanzberatung." }
    ],
    marketsTitle: "Krypto, Forex, Aktien und Metalle",
    marketsText: "ChartsGPT eignet sich für Daytrading und Swingtrading. Analysiere Bitcoin, Altcoins, Währungspaare, Indizes, Aktien, Gold und Silber, sofern der Screenshot genügend Kontext zeigt.",
    faqTitle: "Häufige Fragen",
    faqs: [
      { question: "Gibt ChartsGPT Kauf- oder Verkaufssignale?", answer: "ChartsGPT erstellt informative Analysen und Szenarien. Die App führt keine Trades aus und ersetzt weder eigene Recherche noch Risikomanagement." },
      { question: "Welcher Screenshot liefert das beste Ergebnis?", answer: "Verwende ein scharfes Bild ohne verdeckende Fenster. Symbol, Zeitrahmen und ausreichend Kurshistorie sollten sichtbar sein." },
      { question: "Kann ich Forex und Krypto analysieren?", answer: "Ja. ChartsGPT unterstützt Krypto-, Forex-, Aktien-, Index- und Metallcharts für Day- und Swingtrading." }
    ],
    ctaTitle: "Vom Screenshot zum klareren Tradingplan",
    ctaText: "Lade ChartsGPT für iPhone oder iPad und analysiere deinen nächsten Chart in Sekunden.",
    disclaimer: "ChartsGPT stellt Bildungsinformationen und keine Finanzberatung bereit. Recherchiere selbst, bevor du Anlageentscheidungen triffst.",
    languageLabel: "Sprache",
    footerLinks: { blog: "Blog", privacy: "Datenschutz", terms: "Bedingungen", support: "Support" }
  },
  fr: {
    code: "fr",
    hreflang: "fr-FR",
    lang: "fr",
    label: "Français",
    ogLocale: "fr_FR",
    title: "Analyseur de graphiques IA pour le trading | ChartsGPT",
    description: "Analysez vos captures de graphiques crypto, forex et actions avec l’IA. Obtenez tendance, niveaux clés, entrée, stop loss et invalidation en quelques secondes.",
    keywords: ["analyse graphique IA", "analyse technique IA", "analyser graphique trading", "analyse crypto IA", "analyse forex", "signaux trading IA"],
    menu: "Menu",
    trust: "4,9 sur l’App Store",
    audience: "Pour les traders actifs",
    heroLead: "Scannez un graphique.",
    heroMiddle: "Obtenez votre",
    heroAccent: "plan de trading.",
    phrases: ["Niveaux clés, biais, entrée, stop loss et invalidation.", "Compatible crypto, forex, actions et métaux.", "Un second avis clair en quelques secondes."],
    appStoreLabel: "Télécharger ChartsGPT sur l’App Store",
    androidLabel: "Google Play : bientôt disponible",
    androidTitle: "Android arrive bientôt",
    androidText: "Nous développons la version Android. ChartsGPT est actuellement disponible sur iPhone et iPad.",
    iosInstead: "Télécharger sur iOS",
    beta: {
      kicker: "Inscrivez-vous à la",
      badge: "Bêta Android",
      ariaLabel: "S'inscrire à la bêta Android de ChartsGPT",
      modalTitle: "Rejoindre la bêta Android",
      modalText: "Nous développons la version Android. Laissez votre e-mail pour être parmi les premiers à l'essayer.",
      emailLabel: "Adresse e-mail",
      placeholder: "vous@exemple.com",
      submit: "Rejoindre la liste",
      sending: "Envoi…",
      done: "Vous êtes sur la liste. Nous vous écrirons à l'ouverture de la bêta.",
      already: "Vous êtes déjà sur la liste — à bientôt.",
      invalid: "Veuillez saisir une adresse e-mail valide.",
      error: "Une erreur est survenue. Veuillez réessayer.",
      fineprint: "Nous vous écrirons uniquement au sujet de la bêta Android. Pas de spam, désinscription à tout moment."
    },
    introTitle: "Analyse technique par IA à partir d’une capture",
    introText: "Importez une capture de TradingView ou d’une autre plateforme. ChartsGPT repère la tendance, la structure du marché, les supports, les résistances et les scénarios possibles, sans configuration complexe.",
    features: [
      { title: "Niveaux et structure", text: "Identifiez supports, résistances, cassures, changements de structure et zones importantes." },
      { title: "Plan et gestion du risque", text: "Examinez les entrées, stop loss, take profit, invalidations et remarques de risque proposées." },
      { title: "Indicateurs et figures", text: "Interprétez RSI, MACD, moyennes mobiles, doubles sommets et autres figures courantes." },
      { title: "Contexte de marché", text: "Ajoutez actualités, calendrier macro, sessions et explications de l’AI Coach à votre analyse." }
    ],
    howTitle: "Comment analyser un graphique avec ChartsGPT",
    steps: [
      { title: "1. Importez une capture", text: "Choisissez une image nette avec l’actif, l’unité de temps et les bougies visibles." },
      { title: "2. Vérifiez l’analyse", text: "Étudiez le biais, les niveaux, les figures et les scénarios haussier et baissier." },
      { title: "3. Validez votre plan", text: "Utilisez l’entrée, le stop et l’invalidation comme second avis, pas comme conseil financier." }
    ],
    marketsTitle: "Crypto, forex, actions et métaux",
    marketsText: "ChartsGPT convient au day trading et au swing trading. Analysez Bitcoin, altcoins, paires de devises, indices, actions, or et argent si la capture offre assez de contexte.",
    faqTitle: "Questions fréquentes",
    faqs: [
      { question: "ChartsGPT fournit-il des signaux d’achat ou de vente ?", answer: "ChartsGPT génère des analyses et scénarios informatifs. L’app ne passe aucun ordre et ne remplace ni vos recherches ni votre gestion du risque." },
      { question: "Quelle capture donne le meilleur résultat ?", answer: "Utilisez une image nette, sans fenêtre masquant le graphique, avec le symbole, l’unité de temps et assez d’historique visibles." },
      { question: "Puis-je analyser le forex et les cryptos ?", answer: "Oui. ChartsGPT prend en charge les graphiques crypto, forex, actions, indices et métaux pour le day et le swing trading." }
    ],
    ctaTitle: "Transformez une capture en plan plus clair",
    ctaText: "Téléchargez ChartsGPT sur iPhone ou iPad et analysez votre prochain graphique en quelques secondes.",
    disclaimer: "ChartsGPT fournit du contenu éducatif, pas des conseils financiers. Faites vos propres recherches avant toute décision d’investissement.",
    languageLabel: "Langue",
    footerLinks: { blog: "Blog", privacy: "Confidentialité", terms: "Conditions", support: "Assistance" }
  },
  ar: {
    code: "ar",
    hreflang: "ar-SA",
    lang: "ar",
    dir: "rtl",
    label: "العربية",
    ogLocale: "ar_SA",
    title: "تحليل الرسوم البيانية بالذكاء الاصطناعي | ChartsGPT",
    description: "حلّل صور رسوم العملات الرقمية والفوركس والأسهم بالذكاء الاصطناعي واحصل على الاتجاه والمستويات والدخول ووقف الخسارة والإلغاء خلال ثوانٍ.",
    keywords: ["تحليل الرسم البياني بالذكاء الاصطناعي", "تحليل فني", "تحليل العملات الرقمية", "تحليل الفوركس", "إشارات التداول", "خطة تداول"],
    menu: "القائمة",
    trust: "4.9 على App Store",
    audience: "للمتداولين النشطين",
    heroLead: "ارفع الرسم.",
    heroMiddle: "واحصل على",
    heroAccent: "خطة تداول.",
    phrases: ["مستويات رئيسية واتجاه ودخول ووقف خسارة وإلغاء.", "للعملات الرقمية والفوركس والأسهم والمعادن.", "رأي ثانٍ واضح خلال ثوانٍ."],
    appStoreLabel: "تنزيل ChartsGPT من App Store",
    androidLabel: "Google Play: قريبًا",
    androidTitle: "نسخة Android قادمة",
    androidText: "نعمل على تطوير نسخة Android. يتوفر ChartsGPT حاليًا على iPhone وiPad.",
    iosInstead: "التنزيل على iOS",
    beta: {
      kicker: "سجّل في",
      badge: "نسخة Android التجريبية",
      ariaLabel: "سجّل في نسخة ChartsGPT التجريبية لأندرويد",
      modalTitle: "انضم إلى نسخة Android التجريبية",
      modalText: "نعمل حاليًا على نسخة Android. اترك بريدك الإلكتروني لتكون أول من يجربها.",
      emailLabel: "البريد الإلكتروني",
      placeholder: "you@example.com",
      submit: "انضم إلى قائمة الانتظار",
      sending: "جارٍ الإرسال…",
      done: "تم تسجيلك. سنراسلك عند إطلاق النسخة التجريبية.",
      already: "أنت مسجّل بالفعل — سنتواصل معك.",
      invalid: "يرجى إدخال بريد إلكتروني صحيح.",
      error: "حدث خطأ ما. حاول مرة أخرى.",
      fineprint: "سنراسلك فقط بخصوص نسخة Android التجريبية. بدون رسائل مزعجة، ويمكنك إلغاء الاشتراك في أي وقت."
    },
    introTitle: "تحليل فني بالذكاء الاصطناعي من صورة واحدة",
    introText: "ارفع لقطة من TradingView أو أي منصة تداول. يحدد ChartsGPT اتجاه السوق والبنية والدعم والمقاومة والسيناريوهات المحتملة دون إعدادات معقدة.",
    features: [
      { title: "المستويات والبنية", text: "اكتشف الدعم والمقاومة والاختراقات وتغيّر البنية والمناطق السعرية المهمة." },
      { title: "خطة تراعي المخاطر", text: "راجع الدخول المحتمل ووقف الخسارة وجني الأرباح والإلغاء وملاحظات المخاطر." },
      { title: "المؤشرات والأنماط", text: "افهم RSI وMACD والمتوسطات المتحركة والقمم المزدوجة والأنماط الشائعة." },
      { title: "سياق السوق", text: "أضف الأخبار والتقويم الاقتصادي والجلسات وشرح AI Coach إلى تحليلك." }
    ],
    howTitle: "كيفية تحليل الرسم باستخدام ChartsGPT",
    steps: [
      { title: "1. ارفع لقطة واضحة", text: "أظهر الأصل والإطار الزمني والشموع وسجلًا سعريًا كافيًا." },
      { title: "2. راجع التحليل", text: "تحقق من الاتجاه والمستويات والأنماط والسيناريوهين الصاعد والهابط." },
      { title: "3. قيّم خطتك", text: "استخدم الدخول والوقف والإلغاء كرأي ثانٍ، وليس كنصيحة مالية." }
    ],
    marketsTitle: "عملات رقمية وفوركس وأسهم ومعادن",
    marketsText: "يناسب ChartsGPT التداول اليومي والمتأرجح. حلّل البيتكوين والعملات البديلة وأزواج العملات والمؤشرات والأسهم والذهب والفضة عندما تحتوي الصورة على سياق كافٍ.",
    faqTitle: "الأسئلة الشائعة",
    faqs: [
      { question: "هل يقدم ChartsGPT إشارات شراء أو بيع؟", answer: "ينشئ ChartsGPT تحليلات وسيناريوهات معلوماتية. لا ينفذ الصفقات ولا يستبدل بحثك وإدارة المخاطر." },
      { question: "ما الصورة التي تعطي أفضل نتيجة؟", answer: "استخدم صورة واضحة بلا نوافذ تغطي الرسم، وأظهر الرمز والإطار الزمني وسجل السعر." },
      { question: "هل يمكن تحليل الفوركس والعملات الرقمية؟", answer: "نعم، يدعم ChartsGPT رسوم العملات الرقمية والفوركس والأسهم والمؤشرات والمعادن." }
    ],
    ctaTitle: "حوّل صورة الرسم إلى خطة أوضح",
    ctaText: "نزّل ChartsGPT على iPhone أو iPad وحلّل رسمك التالي خلال ثوانٍ.",
    disclaimer: "يقدم ChartsGPT معلومات تعليمية وليس نصيحة مالية. أجرِ بحثك الخاص قبل اتخاذ قرارات الاستثمار.",
    languageLabel: "اللغة",
    footerLinks: { blog: "المدونة", privacy: "الخصوصية", terms: "الشروط", support: "الدعم" }
  },
  hi: {
    code: "hi",
    hreflang: "hi",
    lang: "hi",
    label: "हिन्दी",
    ogLocale: "hi_IN",
    title: "AI ट्रेडिंग चार्ट एनालाइज़र | ChartsGPT",
    description: "क्रिप्टो, फॉरेक्स और स्टॉक चार्ट के स्क्रीनशॉट का AI से विश्लेषण करें। ट्रेंड, मुख्य लेवल, एंट्री, स्टॉप लॉस और इनवैलिडेशन सेकंडों में पाएं।",
    keywords: ["AI चार्ट एनालाइज़र", "ट्रेडिंग चार्ट विश्लेषण", "तकनीकी विश्लेषण AI", "क्रिप्टो विश्लेषण", "फॉरेक्स चार्ट", "ट्रेडिंग प्लान"],
    menu: "मेनू",
    trust: "App Store पर 4.9",
    audience: "सक्रिय ट्रेडर्स के लिए",
    heroLead: "चार्ट स्कैन करें।",
    heroMiddle: "अपना",
    heroAccent: "ट्रेड प्लान पाएं।",
    phrases: ["मुख्य लेवल, बायस, एंट्री, स्टॉप लॉस और इनवैलिडेशन।", "क्रिप्टो, फॉरेक्स, स्टॉक और मेटल्स के लिए।", "कुछ सेकंड में एक साफ दूसरा नजरिया।"],
    appStoreLabel: "App Store से ChartsGPT डाउनलोड करें",
    androidLabel: "Google Play: जल्द आ रहा है",
    androidTitle: "Android संस्करण जल्द आएगा",
    androidText: "हम Android संस्करण बना रहे हैं। ChartsGPT अभी iPhone और iPad पर उपलब्ध है।",
    iosInstead: "iOS पर डाउनलोड करें",
    beta: {
      kicker: "साइन अप करें",
      badge: "Android बीटा",
      ariaLabel: "ChartsGPT Android बीटा के लिए साइन अप करें",
      modalTitle: "Android बीटा से जुड़ें",
      modalText: "हम Android वर्शन बना रहे हैं। अपना ईमेल दें और बीटा शुरू होते ही सबसे पहले एक्सेस पाएं।",
      emailLabel: "ईमेल पता",
      placeholder: "you@example.com",
      submit: "वेटलिस्ट में जुड़ें",
      sending: "भेजा जा रहा है…",
      done: "आप लिस्ट में हैं। बीटा शुरू होते ही हम ईमेल करेंगे।",
      already: "आप पहले से लिस्ट में हैं — हम संपर्क करेंगे।",
      invalid: "कृपया एक मान्य ईमेल पता डालें।",
      error: "कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।",
      fineprint: "हम केवल Android बीटा के बारे में ईमेल करेंगे। कोई स्पैम नहीं, कभी भी अनसब्सक्राइब करें।"
    },
    introTitle: "एक स्क्रीनशॉट से AI तकनीकी विश्लेषण",
    introText: "TradingView या किसी अन्य प्लेटफॉर्म का स्क्रीनशॉट अपलोड करें। ChartsGPT बिना जटिल सेटअप के ट्रेंड, मार्केट स्ट्रक्चर, सपोर्ट, रेजिस्टेंस और संभावित परिदृश्य पहचानता है।",
    features: [
      { title: "लेवल और स्ट्रक्चर", text: "सपोर्ट, रेजिस्टेंस, ब्रेकआउट, स्ट्रक्चर बदलाव और महत्वपूर्ण प्राइस जोन देखें।" },
      { title: "रिस्क के साथ प्लान", text: "संभावित एंट्री, स्टॉप लॉस, टेक प्रॉफिट, इनवैलिडेशन और रिस्क नोट्स की समीक्षा करें।" },
      { title: "इंडिकेटर और पैटर्न", text: "RSI, MACD, मूविंग एवरेज, डबल टॉप और दूसरे सामान्य पैटर्न समझें।" },
      { title: "मार्केट संदर्भ", text: "न्यूज़, मैक्रो कैलेंडर, सेशन और AI Coach की व्याख्या के साथ विश्लेषण बढ़ाएं।" }
    ],
    howTitle: "ChartsGPT से चार्ट कैसे विश्लेषित करें",
    steps: [
      { title: "1. स्क्रीनशॉट अपलोड करें", text: "ऐसी साफ तस्वीर चुनें जिसमें एसेट, टाइमफ्रेम और कैंडल्स दिखें।" },
      { title: "2. विश्लेषण जांचें", text: "बायस, लेवल, पैटर्न और तेजी व मंदी दोनों परिदृश्य देखें।" },
      { title: "3. अपना प्लान सत्यापित करें", text: "एंट्री, स्टॉप और इनवैलिडेशन को दूसरे नजरिए की तरह लें, वित्तीय सलाह की तरह नहीं।" }
    ],
    marketsTitle: "क्रिप्टो, फॉरेक्स, स्टॉक और मेटल्स",
    marketsText: "ChartsGPT डे ट्रेडिंग और स्विंग ट्रेडिंग दोनों के लिए है। पर्याप्त संदर्भ वाले स्क्रीनशॉट से Bitcoin, altcoins, मुद्रा जोड़ी, इंडेक्स, स्टॉक, गोल्ड और सिल्वर का विश्लेषण करें।",
    faqTitle: "अक्सर पूछे जाने वाले सवाल",
    faqs: [
      { question: "क्या ChartsGPT खरीद या बिक्री संकेत देता है?", answer: "ChartsGPT जानकारी के लिए विश्लेषण और परिदृश्य बनाता है। यह ट्रेड नहीं करता और आपके रिसर्च या रिस्क मैनेजमेंट की जगह नहीं लेता।" },
      { question: "कौन सा स्क्रीनशॉट सबसे अच्छा परिणाम देता है?", answer: "साफ तस्वीर लें, चार्ट को ढकने वाली विंडो हटाएं और सिंबल, टाइमफ्रेम व पर्याप्त प्राइस हिस्ट्री दिखाएं।" },
      { question: "क्या मैं फॉरेक्स और क्रिप्टो विश्लेषित कर सकता हूं?", answer: "हां। ChartsGPT क्रिप्टो, फॉरेक्स, स्टॉक, इंडेक्स और मेटल चार्ट सपोर्ट करता है।" }
    ],
    ctaTitle: "स्क्रीनशॉट को एक साफ प्लान में बदलें",
    ctaText: "iPhone या iPad पर ChartsGPT डाउनलोड करें और अगला चार्ट सेकंडों में विश्लेषित करें।",
    disclaimer: "ChartsGPT शैक्षिक जानकारी देता है, वित्तीय सलाह नहीं। निवेश निर्णय लेने से पहले अपना रिसर्च करें।",
    languageLabel: "भाषा",
    footerLinks: { blog: "ब्लॉग", privacy: "गोपनीयता", terms: "शर्तें", support: "सहायता" }
  },
  ru: {
    code: "ru",
    hreflang: "ru",
    lang: "ru",
    label: "Русский",
    ogLocale: "ru_RU",
    title: "ИИ-анализ графиков для трейдинга | ChartsGPT",
    description: "Анализируйте скриншоты графиков криптовалют, форекс и акций с ИИ. Получайте тренд, уровни, вход, стоп-лосс и отмену сценария за секунды.",
    keywords: ["анализ графика ИИ", "технический анализ", "анализ криптовалют", "анализ форекс", "торговые сигналы", "торговый план"],
    menu: "Меню",
    trust: "4,9 в App Store",
    audience: "Для активных трейдеров",
    heroLead: "Загрузите график.",
    heroMiddle: "Получите",
    heroAccent: "торговый план.",
    phrases: ["Ключевые уровни, направление, вход, стоп и отмена сценария.", "Для криптовалют, форекс, акций и металлов.", "Понятное второе мнение за несколько секунд."],
    appStoreLabel: "Скачать ChartsGPT в App Store",
    androidLabel: "Google Play: скоро",
    androidTitle: "Версия для Android уже в работе",
    androidText: "Мы разрабатываем версию для Android. Сейчас ChartsGPT доступен на iPhone и iPad.",
    iosInstead: "Скачать для iOS",
    beta: {
      kicker: "Записаться в",
      badge: "Бету для Android",
      ariaLabel: "Записаться в бета-версию ChartsGPT для Android",
      modalTitle: "Запишитесь в бету для Android",
      modalText: "Мы разрабатываем версию для Android. Оставьте почту — и вы одними из первых получите доступ к бете.",
      emailLabel: "Электронная почта",
      placeholder: "you@example.com",
      submit: "В список ожидания",
      sending: "Отправляем…",
      done: "Вы в списке. Напишем, когда откроется бета.",
      already: "Вы уже в списке — мы свяжемся с вами.",
      invalid: "Введите корректный адрес электронной почты.",
      error: "Что-то пошло не так. Попробуйте ещё раз.",
      fineprint: "Пишем только о бете для Android. Без спама, отписаться можно в любой момент."
    },
    introTitle: "Технический анализ с ИИ по одному скриншоту",
    introText: "Загрузите скриншот из TradingView или другой платформы. ChartsGPT определит тренд, структуру рынка, поддержку, сопротивление и возможные сценарии без сложной настройки.",
    features: [
      { title: "Уровни и структура", text: "Находите поддержку, сопротивление, пробои, смену структуры и важные ценовые зоны." },
      { title: "План с учетом риска", text: "Проверяйте возможный вход, стоп-лосс, тейк-профит, отмену сценария и риски." },
      { title: "Индикаторы и паттерны", text: "Разбирайте RSI, MACD, скользящие средние, двойные вершины и другие паттерны." },
      { title: "Контекст рынка", text: "Дополняйте анализ новостями, макрокалендарем, сессиями и объяснениями AI Coach." }
    ],
    howTitle: "Как анализировать график в ChartsGPT",
    steps: [
      { title: "1. Загрузите скриншот", text: "Используйте четкое изображение, где видны актив, таймфрейм и свечи." },
      { title: "2. Проверьте анализ", text: "Изучите направление, уровни, паттерны, бычий и медвежий сценарии." },
      { title: "3. Оцените свой план", text: "Используйте вход, стоп и отмену как второе мнение, а не финансовый совет." }
    ],
    marketsTitle: "Криптовалюты, форекс, акции и металлы",
    marketsText: "ChartsGPT подходит для дейтрейдинга и свинг-трейдинга. Анализируйте Bitcoin, альткоины, валютные пары, индексы, акции, золото и серебро, если на скриншоте достаточно контекста.",
    faqTitle: "Частые вопросы",
    faqs: [
      { question: "ChartsGPT дает сигналы на покупку или продажу?", answer: "ChartsGPT создает информационный анализ и сценарии. Приложение не совершает сделки и не заменяет ваши исследования и риск-менеджмент." },
      { question: "Какой скриншот дает лучший результат?", answer: "Используйте четкое изображение без перекрывающих окон. Покажите символ, таймфрейм и достаточную историю цены." },
      { question: "Можно анализировать форекс и криптовалюты?", answer: "Да. ChartsGPT поддерживает графики криптовалют, форекс, акций, индексов и металлов." }
    ],
    ctaTitle: "Превратите скриншот в понятный план",
    ctaText: "Скачайте ChartsGPT для iPhone или iPad и проанализируйте следующий график за секунды.",
    disclaimer: "ChartsGPT предоставляет образовательную информацию, а не финансовые советы. Всегда проводите собственное исследование.",
    languageLabel: "Язык",
    footerLinks: { blog: "Блог", privacy: "Конфиденциальность", terms: "Условия", support: "Поддержка" }
  },
  "zh-hans": {
    code: "zh-hans",
    hreflang: "zh-Hans",
    lang: "zh-Hans",
    label: "简体中文",
    ogLocale: "zh_CN",
    title: "AI 交易图表分析工具 | ChartsGPT",
    description: "用 AI 分析加密货币、外汇和股票图表截图，数秒内获得趋势、关键位、入场、止损和失效条件。",
    keywords: ["AI图表分析", "交易图表分析", "技术分析AI", "加密货币分析", "外汇分析", "交易计划"],
    menu: "菜单",
    trust: "App Store 评分 4.9",
    audience: "为活跃交易者打造",
    heroLead: "上传图表。",
    heroMiddle: "获得清晰的",
    heroAccent: "交易计划。",
    phrases: ["关键位、方向、入场、止损和失效条件。", "支持加密货币、外汇、股票和贵金属。", "数秒内获得清晰的第二意见。"],
    appStoreLabel: "在 App Store 下载 ChartsGPT",
    androidLabel: "Google Play：即将推出",
    androidTitle: "Android 版本正在开发",
    androidText: "我们正在开发 Android 版本。ChartsGPT 目前可用于 iPhone 和 iPad。",
    iosInstead: "下载 iOS 版本",
    beta: {
      kicker: "报名参加",
      badge: "Android 测试版",
      ariaLabel: "报名参加 ChartsGPT Android 测试版",
      modalTitle: "加入 Android 测试版",
      modalText: "我们正在开发 Android 版本。留下邮箱，测试版开放时你将第一批收到通知。",
      emailLabel: "电子邮箱",
      placeholder: "you@example.com",
      submit: "加入等候名单",
      sending: "提交中…",
      done: "已加入名单。测试版开放时我们会发邮件通知你。",
      already: "你已在名单中，我们会与你联系。",
      invalid: "请输入有效的电子邮箱地址。",
      error: "出了点问题，请重试。",
      fineprint: "我们只会发送与 Android 测试版相关的邮件。无垃圾邮件，可随时退订。"
    },
    introTitle: "一张截图即可完成 AI 技术分析",
    introText: "上传 TradingView 或其他平台的截图。ChartsGPT 无需复杂设置，即可识别趋势方向、市场结构、支撑阻力和潜在场景。",
    features: [
      { title: "关键位与结构", text: "识别支撑、阻力、突破、结构变化和重要价格区域。" },
      { title: "风险框架", text: "查看潜在入场、止损、止盈、失效条件和风险提示。" },
      { title: "指标与形态", text: "理解 RSI、MACD、移动平均线、双顶和其他常见形态。" },
      { title: "市场背景", text: "结合新闻、宏观日历、交易时段和 AI Coach 的解释完善分析。" }
    ],
    howTitle: "如何使用 ChartsGPT 分析图表",
    steps: [
      { title: "1. 上传清晰截图", text: "确保资产名称、时间周期、K 线和足够的价格历史可见。" },
      { title: "2. 检查分析", text: "查看方向、关键位、形态以及看涨和看跌两种场景。" },
      { title: "3. 验证计划", text: "将入场、止损和失效条件作为第二意见，而非财务建议。" }
    ],
    marketsTitle: "加密货币、外汇、股票和贵金属",
    marketsText: "ChartsGPT 适用于日内交易和波段交易。只要截图包含足够背景，即可分析 Bitcoin、山寨币、货币对、指数、股票、黄金和白银。",
    faqTitle: "常见问题",
    faqs: [
      { question: "ChartsGPT 会提供买卖信号吗？", answer: "ChartsGPT 生成信息型分析和场景，不会执行交易，也不能替代您自己的研究和风险管理。" },
      { question: "怎样的截图效果最好？", answer: "请使用清晰且无遮挡的图片，并显示交易品种、时间周期和足够的价格历史。" },
      { question: "可以分析外汇和加密货币吗？", answer: "可以。ChartsGPT 支持加密货币、外汇、股票、指数和贵金属图表。" }
    ],
    ctaTitle: "把截图变成更清晰的交易计划",
    ctaText: "在 iPhone 或 iPad 下载 ChartsGPT，数秒内分析下一张图表。",
    disclaimer: "ChartsGPT 提供教育信息，不构成财务建议。做出投资决定前请自行研究。",
    languageLabel: "语言",
    footerLinks: { blog: "博客", privacy: "隐私", terms: "条款", support: "支持" }
  }
};

export const locales: Record<LocaleCode, LocaleContent> = {
  ...coreLocales,
  ...(additionalLocales as Record<LocaleCode, LocaleContent>)
};

export const localeCodes = Object.keys(locales);

export function isLocaleCode(value: string | undefined): value is LocaleCode {
  return Boolean(value && Object.prototype.hasOwnProperty.call(locales, value));
}

export const languageAlternates: Record<string, string> = {
  "x-default": `${SITE_URL}/`,
  "en-US": `${SITE_URL}/`,
  ...Object.fromEntries(
    localeCodes.map((code) => [locales[code].hreflang, `${SITE_URL}/${code}/`])
  )
};
