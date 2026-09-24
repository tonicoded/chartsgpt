import { APP_STORE_URL, betaCopy, localeCodes, locales, type LocaleContent } from "../_lib/locales";

function LanguageLinks({ current, label }: { current: string; label: string }) {
  return (
    <nav className="seo-language-links" aria-label={label}>
      <span>{label}</span>
      <a href="/" hrefLang="en-US" aria-current={current === "en-US" ? "page" : undefined}>English (US)</a>
      {localeCodes.map((code) => (
        <a
          key={code}
          href={`/${code}/`}
          hrefLang={locales[code].hreflang}
          aria-current={current === code ? "page" : undefined}
        >
          {locales[code].label}
        </a>
      ))}
    </nav>
  );
}

function JsonLd({ content }: { content: LocaleContent }) {
  const pageUrl = `https://charts-gpt.com/${content.code}/`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: content.title,
        description: content.description,
        inLanguage: content.lang,
        isPartOf: { "@id": "https://charts-gpt.com/#website" }
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://charts-gpt.com/#app",
        name: "ChartsGPT: Trading Assistant",
        applicationCategory: "FinanceApplication",
        operatingSystem: "iOS, iPadOS",
        description: content.description,
        inLanguage: content.lang,
        url: pageUrl,
        installUrl: APP_STORE_URL,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      ...(content.faqs.length
        ? [{
            "@type": "FAQPage",
            mainEntity: content.faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: { "@type": "Answer", text: faq.answer }
            }))
          }]
        : [])
    ]
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export default function LocalizedLanding({ content }: { content: LocaleContent }) {
  const beta = betaCopy(content);
  const screenshots = [
    ["scan", content.steps[0]?.title ?? "Scan a chart"],
    ["breakdown", content.features[0]?.title ?? "Chart breakdown"],
    ["plan", content.features[1]?.title ?? "Trade plan"],
    ["coach", "AI Coach"],
    ["signals", content.features[2]?.title ?? "Live signals"],
    ["indicators", content.features[3]?.title ?? "Indicators"],
    ["live-price", "Live price"],
    ["learn", content.steps[2]?.title ?? "Learn"],
    ["news", content.marketsTitle]
  ];

  return (
    <div className="home-body home-v2 seo-expanded home-clean" dir={content.dir} lang={content.lang}>
      <JsonLd content={content} />
      <div className="home-shell home-shell-v2">
        <header className="site-header site-header-home" aria-label="ChartsGPT">
          <div className="site-header-inner">
            <a className="site-brand" href={`/${content.code}/`} aria-label="ChartsGPT">
              <img src="/chartsgptnewlogo.png" alt="ChartsGPT" width="44" height="44" />
              <span>ChartsGPT</span>
            </a>
            <details className="blog-menu">
              <summary aria-label={content.menu}><span className="blog-menu-icon" aria-hidden="true" /></summary>
              <div className="blog-menu-panel" role="menu" aria-label={content.menu}>
                <a role="menuitem" href={`/${content.code}/`}>ChartsGPT</a>
                <a role="menuitem" href="/blog/">{content.footerLinks.blog}</a>
                <a role="menuitem" href="/privacy/">{content.footerLinks.privacy}</a>
                <a role="menuitem" href="/terms/">{content.footerLinks.terms}</a>
                <a role="menuitem" href="/support/">{content.footerLinks.support}</a>
              </div>
            </details>
          </div>
        </header>

        <main className="landing landing-home" aria-label={content.title}>
          <section className="clean-hero" aria-labelledby="localized-hero-title">
            <div className="clean-hero-copy">
              <p className="clean-hero-rating"><span aria-hidden="true">★★★★★</span><span>{content.trust}</span><i aria-hidden="true" /><strong>{content.audience}</strong></p>
              <h1 id="localized-hero-title">{content.heroLead}<br />{content.heroMiddle} <span>{content.heroAccent}</span></h1>
              <p className="clean-hero-lead">{content.phrases[0]}</p>
              <div className="clean-hero-actions">
                <a className="clean-store-badge js-appstore" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label={content.appStoreLabel}>
                  <img src="/appstore.svg" alt={content.appStoreLabel} width="150" height="50" /><span>{content.appStoreLabel}</span>
                </a>
                <button className="clean-store-badge gp-trigger" aria-label={beta.ariaLabel} type="button">
                  <img src="/googleplay.svg" alt={content.androidLabel} width="169" height="50" /><span>{beta.badge}</span>
                </button>
              </div>
            </div>
            <div className="clean-hero-visual" aria-label="ChartsGPT app preview">
              <img className="clean-preview clean-preview-left" src="/app-shots/breakdown.webp" alt="ChartsGPT chart breakdown" width="720" height="1558" />
              <img className="clean-preview clean-preview-right" src="/app-shots/plan.webp" alt="ChartsGPT trade plan" width="720" height="1558" />
              <img className="clean-preview clean-preview-main" src="/app-shots/scan.webp" alt="ChartsGPT chart scanner" width="720" height="1558" />
            </div>
          </section>

          <section className="clean-gallery" aria-labelledby="localized-gallery-title">
            <div className="clean-gallery-heading">
              <p className="clean-eyebrow">ChartsGPT</p>
              <h2 id="localized-gallery-title">{content.howTitle}</h2>
              <p>{content.introText}</p>
            </div>
            <div className="clean-marquee" aria-label="ChartsGPT app screenshots">
              <div className="clean-marquee-track">
                {[false, true].map((duplicate) => (
                  <div className="clean-marquee-set" aria-hidden={duplicate || undefined} key={duplicate ? "duplicate" : "primary"}>
                    {screenshots.map(([image, label]) => (
                      <figure key={`${duplicate}-${image}`}><img src={`/app-shots/${image}.webp`} alt={duplicate ? "" : label} width="720" height="1558" loading="lazy" /><figcaption>{label}</figcaption></figure>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="clean-content">
            <section className="clean-intro" aria-labelledby="localized-intro-title">
              <div className="clean-intro-copy">
                <p className="clean-kicker">ChartsGPT AI</p>
                <h2 id="localized-intro-title">{content.introTitle}</h2>
                <p>{content.introText}</p>
                <div className="clean-steps">
                  {content.steps.map((step, index) => <div key={step.title}><span>0{index + 1}</span><strong>{step.title}</strong><small>{step.text}</small></div>)}
                </div>
              </div>
              <div className="clean-intro-art"><img src="/app-shots/scan.webp" alt="ChartsGPT chart scanner" width="720" height="1558" loading="lazy" /></div>
            </section>

            <section className="clean-feature clean-feature-dark">
              <div className="clean-feature-copy">
                <p className="clean-kicker">ChartsGPT</p><h2>{content.features[0]?.title}</h2><p>{content.features[0]?.text}</p>
                <ul className="clean-check-list">{content.features.slice(1, 4).map((feature) => <li key={feature.title}>{feature.title}</li>)}</ul>
              </div>
              <div className="clean-feature-image"><img src="/app-shots/breakdown.webp" alt="ChartsGPT technical analysis" width="720" height="1558" loading="lazy" /></div>
            </section>

            <section className="clean-feature clean-feature-plan">
              <div className="clean-feature-image"><img src="/app-shots/plan.webp" alt="ChartsGPT trade plan" width="720" height="1558" loading="lazy" /></div>
              <div className="clean-feature-copy">
                <p className="clean-kicker">{content.audience}</p><h2>{content.features[1]?.title}</h2><p>{content.features[1]?.text}</p>
                <ul className="clean-check-list">{content.steps.map((step) => <li key={step.title}>{step.title}</li>)}</ul><small>{content.disclaimer}</small>
              </div>
            </section>

            <section className="clean-toolkit">
              <div className="clean-section-heading"><p className="clean-kicker">ChartsGPT</p><h2>{content.howTitle}</h2><p>{content.phrases[1] ?? content.introText}</p></div>
              <div className="clean-toolkit-grid">
                {content.features.map((feature, index) => {
                  const image = ["coach", "signals", "learn", "live-price"][index];
                  return <article className="clean-tool-card" key={feature.title}><div className="clean-tool-art"><img src={`/app-shots/${image}.webp`} alt={feature.title} width="720" height="1558" loading="lazy" /></div><div className="clean-tool-copy"><span>0{index + 1} / ChartsGPT</span><h3>{feature.title}</h3><p>{feature.text}</p></div></article>;
                })}
              </div>
            </section>

            <section className="clean-markets"><div><p className="clean-kicker">ChartsGPT</p><h2>{content.marketsTitle}</h2><p>{content.marketsText}</p></div><ul><li>Crypto</li><li>Forex</li><li>Stocks</li><li>Indices</li><li>Metals</li></ul></section>

            {content.faqs.length ? <section className="clean-faq-section"><div className="clean-section-heading"><p className="clean-kicker">ChartsGPT</p><h2>{content.faqTitle}</h2></div><div className="faq clean-faq">{content.faqs.map((faq) => <details className="faq-item" key={faq.question}><summary>{faq.question}</summary><div className="faq-body">{faq.answer}</div></details>)}</div></section> : null}

            <section className="clean-final-cta" aria-label={content.ctaTitle}><div><p className="clean-kicker">ChartsGPT</p><h2>{content.ctaTitle}</h2><p>{content.ctaText}</p></div><a className="js-appstore" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label={content.appStoreLabel}><img src="/appstore.svg" alt={content.appStoreLabel} width="150" height="50" /></a></section>
          </div>
        </main>

        <footer className="seo-footer">
          <div className="seo-footer-inner">
            <div className="clean-footer-brand"><strong>ChartsGPT</strong><p>{content.ctaTitle}</p></div>
            <details className="clean-language-picker"><summary>{content.languageLabel}: {content.label}</summary><LanguageLinks current={content.code} label={content.languageLabel} /></details>
            <nav className="seo-footer-links" aria-label="ChartsGPT">
              <a href="/blog/">{content.footerLinks.blog}</a><a href="/privacy/">{content.footerLinks.privacy}</a><a href="/terms/">{content.footerLinks.terms}</a><a href="/support/">{content.footerLinks.support}</a>
            </nav>
            <p>{content.disclaimer}</p>
          </div>
        </footer>
      </div>

      <dialog className="gp-modal" id="gp-modal">
        <div className="gp-modal-inner">
          <div className="gp-modal-top"><span className="gp-modal-logo" aria-hidden="true">▶</span><button className="gp-modal-close" aria-label="Close">×</button></div>
          <h3 className="gp-modal-title">{beta.modalTitle}</h3>
          <p className="gp-modal-text">{beta.modalText}</p>
          <form
            className="wl-form"
            noValidate
            data-sending={beta.sending}
            data-done={beta.done}
            data-already={beta.already}
            data-invalid={beta.invalid}
            data-error={beta.error}
          >
            <label className="wl-label" htmlFor="wl-email">{beta.emailLabel}</label>
            <input
              className="wl-input"
              id="wl-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={beta.placeholder}
              required
            />
            <button className="gp-modal-btn wl-submit" type="submit">{beta.submit}</button>
            <p className="wl-status" role="status" aria-live="polite" />
            <p className="wl-fineprint">{beta.fineprint}</p>
          </form>
          <a className="gp-modal-alt js-appstore" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">{content.iosInstead}</a>
        </div>
      </dialog>
    </div>
  );
}
