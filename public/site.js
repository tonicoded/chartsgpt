(() => {
  const config = window.CHARTSGPT_CONFIG || {};
  const appStoreUrl = config.appStoreUrl;
  const playStoreUrl = config.playStoreUrl;

  const isValidUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value);
  const withUtm = (url, platform) => {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("utm_source", "charts-gpt.com");
      parsed.searchParams.set("utm_medium", "website");
      parsed.searchParams.set("utm_campaign", "organic_seo");
      parsed.searchParams.set("utm_content", platform);
      return parsed.toString();
    } catch {
      return url;
    }
  };

  document.querySelectorAll("a.js-appstore").forEach((a) => {
    if (!isValidUrl(appStoreUrl)) return;
    a.href = withUtm(appStoreUrl, "ios");
  });

  document.querySelectorAll("a.js-playstore").forEach((a) => {
    if (!isValidUrl(playStoreUrl)) return;
    a.href = withUtm(playStoreUrl, "android");
  });

  const slugify = (text) =>
    String(text || "")
      .toLowerCase()
      .trim()
      .replace(/['\"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "");

  document.querySelectorAll(".js-toc").forEach((toc) => {
    const article = toc.closest(".blog-article") || document;
    const headings = Array.from(article.querySelectorAll("h2"));
    if (headings.length < 3) return;

    const used = new Map();
    const items = headings
      .map((h) => {
        const base = slugify(h.textContent);
        if (!base) return null;
        const count = (used.get(base) || 0) + 1;
        used.set(base, count);
        const id = count === 1 ? base : `${base}-${count}`;
        if (!h.id) h.id = id;
        return { id: h.id, text: h.textContent.trim() };
      })
      .filter(Boolean);

    if (items.length < 3) return;
    toc.innerHTML = [
      '<div class="toc-title">On this page</div>',
      "<ul>",
      ...items.map((it) => `<li><a href="#${it.id}">${it.text}</a></li>`),
      "</ul>"
    ].join("");
  });

  // ── Google Play modal ──────────────────────────────────────────────
  const gpModal = document.getElementById("gp-modal");
  const gpTrigger = document.querySelector(".gp-trigger");
  if (gpModal && gpTrigger) {
    gpTrigger.addEventListener("click", () => gpModal.showModal());
    gpModal.addEventListener("click", (e) => {
      if (e.target === gpModal) gpModal.close();
    });
    // close button (inline onclick won't run on Vercel)
    const closeBtn = gpModal.querySelector(".gp-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", () => gpModal.close());
  }

  // ── Typewriter on hero subtitle ────────────────────────────────────
  const twText = document.querySelector(".tw-text");
  if (twText) {
    const phrases = [
      "Key levels, bias, entry, stop loss, and invalidation.",
      "Works for crypto, forex, stocks, and metals.",
      "Get your full trade plan in seconds."
    ];
    let pi = 0, ci = 0, deleting = false;

    function tick() {
      const phrase = phrases[pi];
      if (!deleting) {
        twText.textContent = phrase.slice(0, ++ci);
        if (ci === phrase.length) {
          deleting = true;
          setTimeout(tick, 2400);
          return;
        }
        setTimeout(tick, 38);
      } else {
        twText.textContent = phrase.slice(0, --ci);
        if (ci === 0) {
          deleting = false;
          pi = (pi + 1) % phrases.length;
        }
        setTimeout(tick, ci === 0 ? 320 : 20);
      }
    }

    // Show first phrase instantly, then start cycling after pause
    twText.textContent = phrases[0];
    ci = phrases[0].length;
    deleting = true;
    setTimeout(tick, 2800);
  }

  // ── Count-up for "10k+" ────────────────────────────────────────────
  const countEl = document.querySelector(".hero-v2-trust-traders strong");
  if (countEl) {
    const duration = 1400;
    const start = performance.now();
    function countUp(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(eased * 10000);
      countEl.textContent = val >= 1000 ? Math.floor(val / 1000) + "k+" : val + "+";
      if (p < 1) requestAnimationFrame(countUp);
      else countEl.textContent = "10k+";
    }
    // Delay slightly so it's visible after page load
    setTimeout(() => requestAnimationFrame(countUp), 600);
  }
})();
