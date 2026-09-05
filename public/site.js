(() => {
  const config = window.CHARTSGPT_CONFIG || {};
  const appStoreUrl = config.appStoreUrl;
  const playStoreUrl = config.playStoreUrl;

  // Safari's native Smart App Banner stays hidden after a visitor dismisses it.
  // Keep a first-party App Store shortcut visible on iPhone and iPad as a fallback.
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) document.documentElement.classList.add("is-ios-device");

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
