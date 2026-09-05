import { APP_STORE_URL, betaCopy, localeCodes, locales, type LocaleContent } from "../_lib/locales";
import IOSInstallBanner from "./IOSInstallBanner";

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

  return (
    <div className="home-body home-v2 seo-expanded" dir={content.dir} lang={content.lang}>
      <JsonLd content={content} />
      <IOSInstallBanner />
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
                <button className="store-badge store-badge-hero gp-trigger beta-badge" aria-label={beta.ariaLabel} type="button">
                  <svg className="beta-badge-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M3 20.5v-17c0-.83 1-.83 1.5-.5L20 12 4.5 21c-.5.33-1.5.33-1.5-.5Z" fill="currentColor" />
                  </svg>
                  <span className="beta-badge-copy">
                    <span className="beta-badge-kicker">{beta.kicker}</span>
                    <span className="beta-badge-title">{beta.badge}</span>
                  </span>
                </button>
              </div>
            </div>
          </section>

          <div className="seo-content">
            <section className="seo-section seo-intro" aria-labelledby="seo-intro-title">
              <p className="seo-eyebrow">ChartsGPT AI Chart Analyzer</p>
              <h2 id="seo-intro-title">{content.introTitle}</h2>
              <p className="seo-lead">{content.introText}</p>
              <div className="seo-product-showcase" aria-label="ChartsGPT app preview">
                <div className="seo-showcase-copy">
                  <span>{content.audience}</span>
                  <strong>{content.heroLead} {content.heroAccent}</strong>
                </div>
                <figure className="seo-showcase-card seo-showcase-left">
                  <img src="/screen2.jpg" alt="ChartsGPT AI chart analysis preview" loading="lazy" />
                </figure>
                <figure className="seo-showcase-card seo-showcase-main">
                  <img src="/screen6.jpg" alt="ChartsGPT real-time trading signals preview" loading="lazy" />
                </figure>
                <figure className="seo-showcase-card seo-showcase-right">
                  <img src="/screen5.jpg" alt="ChartsGPT technical indicators preview" loading="lazy" />
                </figure>
              </div>
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
