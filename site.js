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
  const applyTheme = (theme, persist = true) => {
    activeTheme = theme === "dark" ? "dark" : "light";
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
    applyTheme(theme);
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
    dragging = true;
    dragger.setPointerCapture?.(event.pointerId);
    chooser.classList.add("is-dragging");
    setPosition(event.clientX);
  });
  dragger.addEventListener("pointermove", (event) => {
    if (dragging) setPosition(event.clientX);
  });
  const finishDrag = () => {
    if (!dragging) return;
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
