import { APP_STORE_URL, localeCodes, locales, type LocaleContent } from "../_lib/locales";

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
  return (
    <div className="home-body home-v2 seo-expanded" dir={content.dir} lang={content.lang}>
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
          <section className="hero-v2 seo-hero" aria-labelledby="localized-hero-title">
            <div className="container hero-v2-grid">
              <div className="hero-v2-copy reveal" style={{ "--delay": "60ms" } as React.CSSProperties}>
                <div className="hero-v2-trust">
                  <span className="hero-v2-trust-stars" aria-hidden="true">★★★★★</span>
                  <span>{content.trust}</span>
                  <span className="hero-v2-trust-divider" aria-hidden="true" />
                  <span className="hero-v2-trust-traders"><strong>{content.audience}</strong></span>
                </div>
                <h1 className="hero-v2-title" id="localized-hero-title">
                  {content.heroLead}<br />{content.heroMiddle}<br /><span className="hero-title-green">{content.heroAccent}</span>
                </h1>
                <p className="hero-v2-sub">
                  <span className="tw-text" data-phrases={JSON.stringify(content.phrases)}>{content.phrases[0]}</span>
                  <span className="tw-cursor" aria-hidden="true" />
                </p>
              </div>

              <div className="hero-v2-stage reveal" style={{ "--delay": "160ms" } as React.CSSProperties} aria-label="ChartsGPT app">
                <div className="stage-phone stage-phone-main"><img src="/screen2.jpg" className="phone-screen phone-screen-a" alt="ChartsGPT AI chart analysis" loading="eager" /></div>
                <div className="stage-phone stage-phone-left"><img src="/screen1.jpg" className="phone-screen phone-screen-a" alt="ChartsGPT chart upload" loading="lazy" /></div>
                <div className="stage-phone stage-phone-right"><img src="/screen3.jpg" className="phone-screen phone-screen-a" alt="ChartsGPT entry and risk analysis" loading="lazy" /></div>
              </div>

              <div className="hero-v2-cta-row reveal" style={{ "--delay": "220ms" } as React.CSSProperties}>
                <a className="store-badge store-badge-hero js-appstore" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label={content.appStoreLabel}>
                  <img src="/appstore.svg" alt={content.appStoreLabel} />
                </a>
                <button className="store-badge store-badge-hero store-badge-static gp-trigger" aria-label={content.androidLabel} type="button">
                  <img src="/googleplay.svg" alt={content.androidLabel} />
                </button>
              </div>
            </div>
          </section>

          <div className="seo-content">
            <section className="seo-section seo-intro" aria-labelledby="seo-intro-title">
              <p className="seo-eyebrow">ChartsGPT AI Chart Analyzer</p>
              <h2 id="seo-intro-title">{content.introTitle}</h2>
              <p className="seo-lead">{content.introText}</p>
              <div className="seo-card-grid">
                {content.features.map((feature) => (
                  <article className="seo-card" key={feature.title}><h3>{feature.title}</h3><p>{feature.text}</p></article>
                ))}
              </div>
            </section>

            <section className="seo-section seo-section-muted" aria-labelledby="seo-how-title">
              <h2 id="seo-how-title">{content.howTitle}</h2>
              <div className="seo-step-grid">
                {content.steps.map((step) => (
                  <article className="seo-step" key={step.title}><h3>{step.title}</h3><p>{step.text}</p></article>
                ))}
              </div>
            </section>

            <section className="seo-section seo-market" aria-labelledby="seo-markets-title">
              <div><p className="seo-eyebrow">Multi-market chart analysis</p><h2 id="seo-markets-title">{content.marketsTitle}</h2></div>
              <p>{content.marketsText}</p>
            </section>

            {content.faqs.length ? (
              <section className="seo-section" aria-labelledby="seo-faq-title">
                <h2 id="seo-faq-title">{content.faqTitle}</h2>
                <div className="faq seo-faq">
                  {content.faqs.map((faq) => (
                    <details className="faq-item" key={faq.question}><summary>{faq.question}</summary><div className="faq-body">{faq.answer}</div></details>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="seo-section seo-cta" aria-label={content.ctaTitle}>
              <div><h2>{content.ctaTitle}</h2><p>{content.ctaText}</p></div>
              <a className="seo-download-button js-appstore" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">{content.appStoreLabel}</a>
            </section>
          </div>
        </main>

        <footer className="seo-footer">
          <div className="seo-footer-inner">
            <LanguageLinks current={content.code} label={content.languageLabel} />
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
          <h3 className="gp-modal-title">{content.androidTitle}</h3>
          <p className="gp-modal-text">{content.androidText}</p>
          <a className="gp-modal-btn js-appstore" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">{content.iosInstead}</a>
        </div>
      </dialog>
    </div>
  );
}
