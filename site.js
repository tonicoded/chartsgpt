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

  // ── Android beta waitlist modal ────────────────────────────────────
  const gpModal = document.getElementById("gp-modal");
  const gpTrigger = document.querySelector(".gp-trigger");
  if (gpModal && gpTrigger) {
    const openModal = () => {
      if (typeof gpModal.showModal === "function") gpModal.showModal();
      else gpModal.setAttribute("open", "");
    };
    const closeModal = () => {
      if (typeof gpModal.close === "function") gpModal.close();
      else gpModal.removeAttribute("open");
    };

    gpTrigger.addEventListener("click", () => {
      openModal();
      const input = gpModal.querySelector(".wl-input");
      if (input && !input.disabled) setTimeout(() => input.focus(), 60);
    });
    gpModal.addEventListener("click", (e) => {
      if (e.target === gpModal) closeModal();
    });
    // close button (inline onclick won't run on Vercel)
    const closeBtn = gpModal.querySelector(".gp-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    const form = gpModal.querySelector(".wl-form");
    if (form) {
      const input = form.querySelector(".wl-input");
      const submit = form.querySelector(".wl-submit");
      const status = form.querySelector(".wl-status");
      const strings = {
        submit: submit ? submit.textContent.trim() : "Join the waitlist",
        sending: form.dataset.sending || "Sending…",
        done: form.dataset.done || "You're on the list. We'll email you when the beta opens.",
        already: form.dataset.already || "You're already on the list — we'll be in touch.",
        invalid: form.dataset.invalid || "Please enter a valid email address.",
        error: form.dataset.error || "Something went wrong. Please try again."
      };
      const storageKey = "chartsgpt_android_waitlist";
      const restUrl = config.supabaseUrl
        ? `${String(config.supabaseUrl).replace(/\/+$/, "")}/rest/v1/${config.waitlistTable || "android_waitlist"}`
        : null;

      const setStatus = (message, state) => {
        if (!status) return;
        status.textContent = message || "";
        status.dataset.state = state || "";
      };

      const markJoined = () => {
        form.classList.add("is-joined");
        if (input) {
          input.disabled = true;
          input.blur();
        }
        if (submit) submit.disabled = true;
      };

      let alreadyJoined = false;
      try {
        alreadyJoined = window.localStorage.getItem(storageKey) === "1";
      } catch {}
      if (alreadyJoined) {
        markJoined();
        setStatus(strings.already, "ok");
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!input || !submit || submit.disabled) return;

        const email = input.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 254) {
          setStatus(strings.invalid, "error");
          input.focus();
          return;
        }

        submit.disabled = true;
        submit.textContent = strings.sending;
        setStatus("", "");

        // Localized pages carry their language on .home-body; the root page is en-US.
        const localeEl = document.querySelector(".home-body[lang]");
        const locale =
          (localeEl && localeEl.getAttribute("lang")) || document.documentElement.lang || "en-US";
        const payload = {
          email,
          locale: locale.slice(0, 16),
          source: "website",
          referrer: (document.referrer || "").slice(0, 512),
          user_agent: (navigator.userAgent || "").slice(0, 512)
        };

        const succeed = (duplicate) => {
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {}
          markJoined();
          setStatus(duplicate ? strings.already : strings.done, "ok");
        };

        // Same-origin first: some mobile networks, VPNs and content blockers
        // drop direct requests to supabase.co, so the site's own API route is
        // the reliable path. Falling back keeps it working on static hosting.
        let lastError = "net";
        try {
          const response = await fetch("/api/android-waitlist/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            let duplicate = false;
            try {
              duplicate = (await response.json()).duplicate === true;
            } catch {}
            succeed(duplicate);
            return;
          }

          if (response.status === 422) {
            setStatus(strings.invalid, "error");
            submit.disabled = false;
            submit.textContent = strings.submit;
            input.focus();
            return;
          }

          lastError = `api${response.status}`;
        } catch {
          lastError = "api";
        }

        try {
          if (!restUrl || !config.supabaseAnonKey) throw new Error("unconfigured");

          const response = await fetch(restUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: config.supabaseAnonKey,
              Authorization: `Bearer ${config.supabaseAnonKey}`,
              Prefer: "return=minimal"
            },
            body: JSON.stringify(payload)
          });

          // 409 = unique violation, i.e. this email already signed up.
          if (response.ok || response.status === 409) {
            succeed(response.status === 409);
            return;
          }

          lastError = `${lastError}/db${response.status}`;
        } catch {
          lastError = `${lastError}/db`;
        }

        setStatus(`${strings.error} (${lastError})`, "error");
        submit.disabled = false;
        submit.textContent = strings.submit;
      });
    }
  }

  // ── Typewriter on hero subtitle ────────────────────────────────────
  const twText = document.querySelector(".tw-text");
  if (twText) {
    let localizedPhrases = null;
    try {
      localizedPhrases = JSON.parse(twText.dataset.phrases || "null");
    } catch {}
    const phrases = Array.isArray(localizedPhrases) && localizedPhrases.length
      ? localizedPhrases
      : [
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
  const countEl = document.querySelector(".hero-v2-trust-traders strong[data-count-traders]");
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

// ── Premium Light / Dark style chooser ─────────────────────────────
(() => {
  const page = document.querySelector(".home-clean");
  if (!page) return;

  const storageKey = "chartsgpt-style-v1";
  const searchParams = new URLSearchParams(window.location.search);
  const forceChooser = searchParams.has("choose-style");
  const previewTheme = ["light", "dark"].includes(searchParams.get("theme-preview"))
    ? searchParams.get("theme-preview")
    : null;
  const html = document.documentElement;
  const getSavedTheme = () => {
    try {
      const value = window.localStorage.getItem(storageKey);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  };

  let activeTheme = previewTheme || getSavedTheme() || "light";
  const applyTheme = (theme, persist = true, animate = persist) => {
    const nextTheme = theme === "dark" ? "dark" : "light";
    const commit = () => {
      activeTheme = nextTheme;
      html.dataset.chartTheme = activeTheme;
      html.style.colorScheme = activeTheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", activeTheme === "dark" ? "#050505" : "#ffffff");
      if (persist) {
        try { window.localStorage.setItem(storageKey, activeTheme); } catch {}
      }
      const toggle = document.querySelector(".style-theme-toggle");
      if (toggle) {
        const next = activeTheme === "dark" ? "light" : "dark";
        toggle.dataset.theme = activeTheme;
        toggle.setAttribute("aria-label", `Switch to ${next} style`);
        toggle.setAttribute("title", `Switch to ${next} style`);
      }
    };

    if (!animate || !document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit();
      return;
    }

    const toggle = document.querySelector(".style-theme-toggle");
    const rect = toggle?.getBoundingClientRect();
    html.style.setProperty("--theme-reveal-x", `${rect ? rect.left + rect.width / 2 : window.innerWidth / 2}px`);
    html.style.setProperty("--theme-reveal-y", `${rect ? rect.top + rect.height / 2 : window.innerHeight / 2}px`);
    html.dataset.themeTransition = nextTheme;
    const transition = document.startViewTransition(commit);
    transition.finished.finally(() => delete html.dataset.themeTransition);
  };
  applyTheme(activeTheme, false);

  // The split-screen preview renders the real homepage in two inert frames.
  // Preview frames apply their requested theme without saving or nesting the chooser.
  if (previewTheme) return;

  const header = page.querySelector(".site-header-inner");
  const menu = header?.querySelector(".blog-menu");
  if (header && !header.querySelector(".style-theme-toggle")) {
    const toggle = document.createElement("button");
    toggle.className = "style-theme-toggle";
    toggle.type = "button";
    toggle.innerHTML = '<span class="style-toggle-sun" aria-hidden="true">☼</span><span class="style-toggle-moon" aria-hidden="true">◐</span>';
    toggle.addEventListener("click", () => applyTheme(activeTheme === "dark" ? "light" : "dark"));
    header.insertBefore(toggle, menu || null);
    applyTheme(activeTheme, false);
  }

  if (getSavedTheme() && !forceChooser) return;

  const lang = (page.getAttribute("lang") || html.lang || "en").toLowerCase().split("-")[0];
  const copy = {
    en: ["Choose your style", "Slide toward the experience you want", "Light", "Clean clarity", "Dark", "Focused intensity", "Drag to choose"],
    nl: ["Kies je stijl", "Schuif naar de ervaring die bij je past", "Licht", "Heldere eenvoud", "Donker", "Volledige focus", "Sleep om te kiezen"],
    de: ["Wähle deinen Stil", "Schiebe zu deinem bevorzugten Erlebnis", "Hell", "Klare Übersicht", "Dunkel", "Volle Konzentration", "Zum Wählen ziehen"],
    es: ["Elige tu estilo", "Desliza hacia la experiencia que prefieras", "Claro", "Claridad limpia", "Oscuro", "Máxima concentración", "Desliza para elegir"],
    fr: ["Choisissez votre style", "Faites glisser vers votre expérience préférée", "Clair", "Clarté absolue", "Sombre", "Concentration totale", "Glissez pour choisir"]
  }[lang] || ["Choose your style", "Slide toward the experience you want", "Light", "Clean clarity", "Dark", "Focused intensity", "Drag to choose"];

  const chooser = document.createElement("div");
  chooser.className = "style-chooser";
  chooser.setAttribute("role", "dialog");
  chooser.setAttribute("aria-modal", "true");
  chooser.setAttribute("aria-labelledby", "style-chooser-title");
  chooser.style.setProperty("--style-split", "50%");
  chooser.innerHTML = `
    <div class="style-preview style-preview-light" aria-hidden="true"><iframe title="" tabindex="-1"></iframe></div>
    <div class="style-preview style-preview-dark" aria-hidden="true"><iframe title="" tabindex="-1"></iframe></div>
    <div class="style-chooser-title">
      <p>${copy[1]}</p>
      <h2 id="style-chooser-title">${copy[0]}</h2>
    </div>
    <button class="style-select-side style-select-light" type="button" data-style="light" aria-label="${copy[2]}"></button>
    <button class="style-select-side style-select-dark" type="button" data-style="dark" aria-label="${copy[4]}"></button>
    <div class="style-divider" aria-hidden="true"></div>
    <button class="style-dragger" type="button" aria-label="${copy[6]}" aria-describedby="style-drag-hint">
      <span class="style-dragger-light">☼</span><i></i><span class="style-dragger-dark">◐</span>
    </button>
    <p class="style-drag-hint" id="style-drag-hint"><span>←</span>${copy[6]}<span>→</span></p>
  `;

  const previewUrl = new URL(window.location.href);
  previewUrl.searchParams.delete("choose-style");
  previewUrl.searchParams.set("theme-preview", "light");
  chooser.querySelector(".style-preview-light iframe").src = previewUrl.href;
  previewUrl.searchParams.set("theme-preview", "dark");
  chooser.querySelector(".style-preview-dark iframe").src = previewUrl.href;

  document.body.appendChild(chooser);
  document.body.classList.add("style-chooser-open");

  const dragger = chooser.querySelector(".style-dragger");
  let dragging = false;
  let position = 50;
  let completed = false;

  const setPosition = (clientX) => {
    const width = Math.max(window.innerWidth, 1);
    position = Math.max(8, Math.min(92, (clientX / width) * 100));
    chooser.style.setProperty("--style-split", `${position}%`);
    chooser.classList.toggle("leans-dark", position < 42);
    chooser.classList.toggle("leans-light", position > 58);
  };

  const choose = (theme) => {
    if (completed) return;
    completed = true;
    const chosenPosition = theme === "dark" ? 0 : 100;
    chooser.style.setProperty("--style-split", `${chosenPosition}%`);
    chooser.classList.add("is-chosen", `chose-${theme}`);
    applyTheme(theme, true, false);
    window.setTimeout(() => {
      chooser.classList.add("is-leaving");
      document.body.classList.remove("style-chooser-open");
    }, 430);
    window.setTimeout(() => chooser.remove(), 1050);
  };

  chooser.querySelectorAll(".style-select-side").forEach((button) => {
    button.addEventListener("click", () => choose(button.dataset.style));
  });

  dragger.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    dragger.setPointerCapture?.(event.pointerId);
    chooser.classList.add("is-dragging");
    setPosition(event.clientX);
  });
  dragger.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    event.preventDefault();
    setPosition(event.clientX);
  });
  const finishDrag = (event) => {
    if (!dragging) return;
    event?.preventDefault();
    dragging = false;
    chooser.classList.remove("is-dragging");
    if (position <= 34) choose("dark");
    else if (position >= 66) choose("light");
    else {
      position = 50;
      chooser.style.setProperty("--style-split", "50%");
      chooser.classList.remove("leans-light", "leans-dark");
    }
  };
  dragger.addEventListener("pointerup", finishDrag);
  dragger.addEventListener("pointercancel", finishDrag);
  dragger.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
  dragger.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
  chooser.addEventListener("selectstart", (event) => event.preventDefault());
  dragger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); choose("dark"); }
    if (event.key === "ArrowRight") { event.preventDefault(); choose("light"); }
  });
  let loadedFrames = 0;
  chooser.querySelectorAll("iframe").forEach((frame) => {
    frame.addEventListener("load", () => {
      loadedFrames += 1;
      if (loadedFrames === 2) chooser.classList.add("is-ready");
    }, { once: true });
  });
  window.setTimeout(() => chooser.classList.add("is-ready"), 1200);
  window.setTimeout(() => dragger.focus({ preventScroll: true }), 520);
})();

// ── Clean motion system ─────────────────────────────────────────────
(() => {
  const page = document.querySelector(".home-clean");
  if (!page || new URLSearchParams(window.location.search).has("theme-preview")) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const revealGroups = [
    [".clean-hero-rating,.clean-hero h1,.clean-hero-lead,.clean-hero-actions", "motion-reveal motion-from-left"],
    [".clean-hero-visual,.clean-intro-art,.clean-feature-image", "motion-reveal motion-from-right"],
    [".clean-gallery-heading,.clean-intro-copy,.clean-feature-copy,.clean-section-heading,.clean-markets > div,.clean-markets > ul,.clean-final-cta > *", "motion-reveal"],
    [".clean-steps > div,.clean-tool-card,.clean-faq .faq-item,.clean-learn-grid a", "motion-reveal motion-card"]
  ];

  const revealItems = [];
  revealGroups.forEach(([selector, classNames]) => {
    page.querySelectorAll(selector).forEach((element, index) => {
      element.classList.add(...classNames.split(" "));
      element.style.setProperty("--motion-delay", `${Math.min(index % 4, 3) * 70}ms`);
      revealItems.push(element);
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });
  revealItems.forEach((item) => observer.observe(item));

  const hero = page.querySelector(".clean-hero");
  const heroVisual = page.querySelector(".clean-hero-visual");
  if (hero && heroVisual && window.matchMedia("(pointer: fine)").matches) {
    hero.addEventListener("pointermove", (event) => {
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      heroVisual.style.setProperty("--hero-tilt-x", `${(-y * 2.4).toFixed(2)}deg`);
      heroVisual.style.setProperty("--hero-tilt-y", `${(x * 3).toFixed(2)}deg`);
      heroVisual.style.setProperty("--hero-shift-x", `${(x * 7).toFixed(1)}px`);
      heroVisual.style.setProperty("--hero-shift-y", `${(y * 5).toFixed(1)}px`);
    }, { passive: true });
    hero.addEventListener("pointerleave", () => {
      ["--hero-tilt-x", "--hero-tilt-y", "--hero-shift-x", "--hero-shift-y"].forEach((property) => heroVisual.style.removeProperty(property));
    });
  }

  const progress = document.createElement("div");
  progress.className = "clean-scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.appendChild(progress);
  let progressQueued = false;
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const value = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    progress.style.transform = `scaleX(${value})`;
    progressQueued = false;
  };
  window.addEventListener("scroll", () => {
    if (progressQueued) return;
    progressQueued = true;
    requestAnimationFrame(updateProgress);
  }, { passive: true });
  updateProgress();
})();

// ── Epic layer: live chart, AI scan, typewriter, spotlight ─────────
(() => {
  const page = document.querySelector(".home-clean");
  const hero = page?.querySelector(".clean-hero");
  if (!page || !hero) return;

  const params = new URLSearchParams(window.location.search);
  const isPreview = params.has("theme-preview");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const html = document.documentElement;
  const isDark = () => html.dataset.chartTheme === "dark";

  // A candlestick chart builds itself behind the hero, then an AI scan
  // sweeps across it and lays down a trade plan: the product in one loop.
  // It is an illustration, so it carries labels and never prices.
  const canvas = document.createElement("canvas");
  canvas.className = "epic-chart";
  canvas.setAttribute("aria-hidden", "true");
  hero.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let width = 0, height = 0, ratio = 1;
  let candles = [], plan = null, startedAt = 0, running = false, frame = 0;
  const CANDLE_MS = 55, SCAN_MS = 1500, LEVEL_MS = 260, HOLD_MS = 4200, FADE_MS = 700;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const build = () => {
    const spacing = width < 700 ? 16 : 22;
    const count = Math.max(24, Math.floor(width / spacing));
    const rangeEnd = Math.floor(count * 0.62);
    let price = 100;
    const rangeTop = 106, rangeLow = 96;
    candles = [];
    for (let i = 0; i < count; i++) {
      const open = price;
      let drift;
      if (i < rangeEnd) {
        // Coil inside a range, bouncing off its edges.
        drift = (Math.random() - 0.5) * 4.2;
        if (price > rangeTop - 1.5) drift -= 2.4;
        if (price < rangeLow + 1.5) drift += 2.4;
      } else {
        // Break out and trend, with shallow pullbacks.
        drift = (Math.random() - 0.32) * 3.6;
      }
      price = open + drift;
      const high = Math.max(open, price) + Math.random() * 1.6;
      const low = Math.min(open, price) - Math.random() * 1.6;
      candles.push({ open, close: price, high, low });
    }
    const highs = candles.map((c) => c.high), lows = candles.map((c) => c.low);
    const max = Math.max(...highs), min = Math.min(...lows);
    const entry = rangeTop + 1.8;
    plan = {
      spacing, max: max + 3, min: min - 3, breakout: rangeEnd,
      levels: [
        { key: "Resistance", value: rangeTop, tone: "muted" },
        { key: "Support", value: rangeLow, tone: "muted" },
        { key: "Entry", value: entry, tone: "gold" },
        { key: "Stop", value: (rangeTop + rangeLow) / 2 - 0.5, tone: "down" },
        { key: "Target", value: Math.min(max + 1, entry + (entry - rangeLow) * 1.6), tone: "up" }
      ]
    };
    startedAt = performance.now();
  };

  const palette = () => isDark()
    ? { up: "#E7AD34", down: "rgba(244,241,233,.55)", grid: "rgba(255,255,255,.05)", text: "#F4F1E9", pill: "rgba(17,17,17,.9)", muted: "rgba(244,241,233,.4)", red: "#F06B5F", green: "#3DD68C", gold: "#F0C661" }
    : { up: "#D49A22", down: "rgba(23,23,23,.45)", grid: "rgba(0,0,0,.05)", text: "#171717", pill: "rgba(255,255,255,.95)", muted: "rgba(23,23,23,.35)", red: "#D9443A", green: "#1A9F5F", gold: "#C88D1F" };

  const draw = (now) => {
    if (!plan) return;
    const t = now - startedAt;
    const c = palette();
    const top = height * 0.2, bottom = height * 0.9;
    const y = (v) => bottom - ((v - plan.min) / (plan.max - plan.min)) * (bottom - top);
    const total = candles.length;
    const shown = Math.min(total, t / CANDLE_MS);
    const buildDone = total * CANDLE_MS;
    const fadeStart = buildDone + SCAN_MS + LEVEL_MS * plan.levels.length + HOLD_MS;
    const alpha = t > fadeStart ? Math.max(0, 1 - (t - fadeStart) / FADE_MS) : 1;

    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = alpha;

    ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const gy = Math.round(top + ((bottom - top) / 6) * i) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(width, gy); ctx.stroke();
    }

    const bodyW = Math.max(4, plan.spacing * 0.5);
    for (let i = 0; i < Math.ceil(shown); i++) {
      const k = candles[i];
      const grow = Math.min(1, shown - i);
      const x = i * plan.spacing + plan.spacing / 2;
      const close = k.open + (k.close - k.open) * grow;
      const up = close >= k.open;
      ctx.strokeStyle = up ? c.up : c.down;
      ctx.fillStyle = up ? c.up : c.down;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y(k.high * grow + Math.max(k.open, close) * (1 - grow))); ctx.lineTo(x, y(k.low * grow + Math.min(k.open, close) * (1 - grow))); ctx.stroke();
      const yTop = y(Math.max(k.open, close)), h = Math.max(1.5, y(Math.min(k.open, close)) - yTop);
      if (up) ctx.fillRect(x - bodyW / 2, yTop, bodyW, h);
      else ctx.strokeRect(x - bodyW / 2 + 0.6, yTop + 0.6, bodyW - 1.2, h - 1.2);
    }

    // The scan: a gold beam crosses the finished chart.
    const scanT = (t - buildDone) / SCAN_MS;
    if (scanT > 0 && scanT < 1.15) {
      const sx = Math.min(scanT, 1) * width;
      const beam = ctx.createLinearGradient(sx - 140, 0, sx, 0);
      beam.addColorStop(0, "rgba(240,198,97,0)");
      beam.addColorStop(1, isDark() ? "rgba(240,198,97,.22)" : "rgba(212,154,34,.16)");
      ctx.fillStyle = beam; ctx.fillRect(sx - 140, top - 20, 140, bottom - top + 40);
      ctx.fillStyle = c.gold; ctx.fillRect(sx - 1, top - 20, 2, bottom - top + 40);
    }

    // Labels keep at least 26px apart so neighbouring levels stay readable.
    const labelY = plan.levels.map((level, index) => ({ index, y: y(level.value) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labelY.length; i++) labelY[i].y = Math.max(labelY[i].y, labelY[i - 1].y + 26);
    const labelAt = [];
    labelY.forEach(({ index, y: ly }) => { labelAt[index] = ly; });

    // The plan: each level draws in from the left with its label.
    plan.levels.forEach((level, index) => {
      const lt = (t - buildDone - SCAN_MS * 0.85 - index * LEVEL_MS) / 520;
      if (lt <= 0) return;
      const p = 1 - Math.pow(1 - Math.min(lt, 1), 3);
      const ly = Math.round(y(level.value)) + 0.5;
      const color = level.tone === "gold" ? c.gold : level.tone === "down" ? c.red : level.tone === "up" ? c.green : c.muted;
      const startX = plan.breakout * plan.spacing * 0.35;
      ctx.strokeStyle = color; ctx.lineWidth = level.tone === "muted" ? 1 : 1.6;
      ctx.setLineDash(level.tone === "muted" ? [4, 6] : level.tone === "gold" ? [] : [8, 6]);
      ctx.beginPath(); ctx.moveTo(startX, ly); ctx.lineTo(startX + (width - startX - 8) * p, ly); ctx.stroke();
      ctx.setLineDash([]);
      if (lt > 0.6) {
        ctx.globalAlpha = alpha * Math.min(1, (lt - 0.6) / 0.4);
        ctx.font = "600 11px Geist, -apple-system, sans-serif";
        const label = level.key.toUpperCase();
        const tw = ctx.measureText(label).width;
        const px = width - tw - 34, py = labelAt[index] - 11;
        ctx.fillStyle = c.pill; ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(px, py, tw + 20, 22, 11); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.fillText(label, px + 10, py + 15);
        ctx.globalAlpha = alpha;
      }
    });

    ctx.globalAlpha = 1;
    if (t > fadeStart + FADE_MS + 300) build();
  };

  const loop = (now) => {
    if (!running) return;
    draw(now);
    frame = requestAnimationFrame(loop);
  };
  const start = () => { if (running || reduceMotion) return; running = true; frame = requestAnimationFrame(loop); };
  const stop = () => { running = false; cancelAnimationFrame(frame); };

  resize(); build();
  if (reduceMotion) {
    startedAt = performance.now() - (candles.length * CANDLE_MS + SCAN_MS + LEVEL_MS * 6 + 600);
    draw(performance.now());
  } else {
    new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop())).observe(hero);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  }
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); build(); if (reduceMotion) draw(performance.now() + 1e6); }, 150);
  });
  new MutationObserver(() => { if (!running) draw(performance.now()); }).observe(html, { attributes: true, attributeFilter: ["data-chart-theme"] });

  // The camera screen gets a scan line moving over it.
  const visual = hero.querySelector(".clean-hero-visual");
  const main = visual?.querySelector(".clean-preview-main");
  if (visual && main) {
    const scan = document.createElement("div");
    scan.className = "epic-phone-scan";
    scan.setAttribute("aria-hidden", "true");
    scan.innerHTML = "<i></i>";
    visual.appendChild(scan);
    const place = () => {
      Object.assign(scan.style, { left: `${main.offsetLeft}px`, top: `${main.offsetTop}px`, width: `${main.offsetWidth}px`, height: `${main.offsetHeight}px`, transform: getComputedStyle(main).transform });
    };
    if (main.complete) place(); else main.addEventListener("load", place);
    window.addEventListener("resize", place);
  }

  if (isPreview || reduceMotion) return;

  // Typewriter on the gold words of the English headline.
  const accent = hero.querySelector("h1 span");
  const lang = (page.getAttribute("lang") || html.lang || "en").toLowerCase();
  if (accent && lang.startsWith("en") && accent.textContent.trim() === "trade plan.") {
    const h1 = accent.closest("h1");
    h1.setAttribute("aria-label", h1.textContent.replace(/\s+/g, " ").trim());
    const words = ["trade plan.", "key levels.", "entry zone.", "stop loss."];
    const text = document.createElement("span");
    text.className = "epic-typed";
    text.textContent = words[0];
    const caret = document.createElement("i");
    caret.className = "epic-caret";
    accent.textContent = "";
    accent.append(text, caret);
    accent.setAttribute("aria-hidden", "true");
    let wi = 0, ci = words[0].length, deleting = true;
    const tick = () => {
      const word = words[wi];
      if (deleting) {
        text.textContent = word.slice(0, --ci);
        if (ci === 0) { deleting = false; wi = (wi + 1) % words.length; setTimeout(tick, 260); return; }
        setTimeout(tick, 34);
      } else {
        text.textContent = words[wi].slice(0, ++ci);
        if (ci === words[wi].length) { deleting = true; setTimeout(tick, 2600); return; }
        setTimeout(tick, 70);
      }
    };
    setTimeout(tick, 3200);
  }

  // A soft gold light follows the pointer across cards.
  if (window.matchMedia("(pointer: fine)").matches) {
    page.querySelectorAll(".clean-tool-card, .clean-learn-grid a, .clean-faq .faq-item, .clean-steps > div").forEach((card) => {
      card.classList.add("epic-spot");
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        card.style.setProperty("--my", `${event.clientY - rect.top}px`);
      }, { passive: true });
    });
  }
})();
