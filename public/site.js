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
      .replace(/['"]/g, "")
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

  const homeV2 = document.body.classList.contains("home-v2");
  if (homeV2) {
    const rail = document.querySelector("[data-shot-rail]");
    const cards = Array.from(document.querySelectorAll("[data-shot-card]"));
    const prevBtn = document.querySelector('[data-shot-nav="prev"]');
    const nextBtn = document.querySelector('[data-shot-nav="next"]');
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const updateActiveCard = () => {
      if (!rail || !cards.length) return;
      const railCenter = rail.scrollLeft + rail.clientWidth / 2;
      let active = cards[0];
      let bestDist = Number.POSITIVE_INFINITY;

      cards.forEach((card) => {
        const center = card.offsetLeft + card.clientWidth / 2;
        const dist = Math.abs(center - railCenter);
        if (dist < bestDist) {
          bestDist = dist;
          active = card;
        }
      });

      cards.forEach((card) => {
        card.classList.toggle("is-active", card === active);
      });
    };

    const stepRail = (direction) => {
      if (!rail || !cards.length) return;
      const cardWidth = cards[0].offsetWidth || rail.clientWidth * 0.8;
      const gap = 14;
      rail.scrollBy({
        left: direction * (cardWidth + gap),
        behavior: prefersReduced ? "auto" : "smooth"
      });
    };

    if (prevBtn) {
      prevBtn.addEventListener("click", () => stepRail(-1));
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => stepRail(1));
    }

    if (rail) {
      rail.addEventListener("scroll", updateActiveCard, { passive: true });
      rail.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          stepRail(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          stepRail(-1);
        }
      });
      updateActiveCard();
    }

    const stage = document.querySelector(".hero-v2-stage");
    const main = document.querySelector(".stage-phone-main");
    const left = document.querySelector(".stage-phone-left");
    const right = document.querySelector(".stage-phone-right");

    if (stage && main && left && right) {
      const shots = [
        { src: "/6.5_01.jpg", alt: "ChartsGPT camera capture flow" },
        { src: "/6.5_02.jpg", alt: "ChartsGPT trend analysis screen" },
        { src: "/6.5_03.jpg", alt: "ChartsGPT entry and risk guidance view" },
        { src: "/6.5_04.jpg", alt: "ChartsGPT all-in-one scanner output" },
        { src: "/6.5_05.jpg", alt: "ChartsGPT live market tracking view" },
        { src: "/6.5_06.jpg", alt: "ChartsGPT AI chat assistant view" }
      ];

      const slots = [
        { host: main, offset: 0 },
        { host: left, offset: -1 },
        { host: right, offset: 1 }
      ];

      let baseIndex = 1;
      let rotating = false;
      let autoRotateId = 0;

      const normalizeIndex = (i) => (i + shots.length) % shots.length;

      const setSlotShot = (slot, shot, animate) => {
        const img = slot.host.querySelector("img");
        if (!img) return;

        const currentSrc = img.getAttribute("src") || "";
        const sameShot = currentSrc.endsWith(shot.src) && img.getAttribute("alt") === shot.alt;
        if (sameShot) return;

        const swap = () => {
          if (animate && !prefersReduced) {
            slot.host.classList.add("is-swapping");
            window.setTimeout(() => {
              img.src = shot.src;
              img.alt = shot.alt;
            }, 170);
            window.setTimeout(() => {
              slot.host.classList.remove("is-swapping");
            }, 420);
          } else {
            img.src = shot.src;
            img.alt = shot.alt;
          }
        };

        const preload = new Image();
        preload.onload = swap;
        preload.onerror = swap;
        preload.src = shot.src;
      };

      const renderSlots = (animate = true) => {
        slots.forEach((slot) => {
          const shot = shots[normalizeIndex(baseIndex + slot.offset)];
          setSlotShot(slot, shot, animate);
        });
      };

      const stepRotation = () => {
        if (rotating) return;
        rotating = true;
        baseIndex = normalizeIndex(baseIndex + 1);
        renderSlots(true);
        window.setTimeout(() => {
          rotating = false;
        }, prefersReduced ? 80 : 460);
      };

      renderSlots(false);
      autoRotateId = window.setInterval(stepRotation, prefersReduced ? 2200 : 2600);

      document.addEventListener("visibilitychange", () => {
        if (document.hidden && autoRotateId) {
          window.clearInterval(autoRotateId);
          autoRotateId = 0;
          return;
        }
        if (!document.hidden && !autoRotateId) {
          autoRotateId = window.setInterval(stepRotation, prefersReduced ? 2200 : 2600);
        }
      });

      if (!prefersReduced) {
        stage.addEventListener("pointermove", (event) => {
          const rect = stage.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width - 0.5;
          const y = (event.clientY - rect.top) / rect.height - 0.5;
          main.style.transform = `translate(${x * 10}px, ${y * 10}px)`;
          left.style.transform = `rotate(-13deg) translate(${x * 14}px, ${y * 12}px)`;
          right.style.transform = `rotate(11deg) translate(${x * 18}px, ${y * 10}px)`;
        });

        stage.addEventListener("pointerleave", () => {
          main.style.transform = "";
          left.style.transform = "rotate(-13deg)";
          right.style.transform = "rotate(11deg)";
        });
      }
    }
  }

  // Animated chart lines in hero background
  const canvas = document.getElementById("hero-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let W = 0;
    let H = 0;
    let raf = 0;
    const isHomeV2 = Boolean(canvas.closest(".hero-v2"));
    const startTime = performance.now();

    // Same market cycle used in iOS WelcomeChartCanvas / Paywall background.
    const CLOSES = [
      0.48, 0.46, 0.49, 0.47, 0.50, 0.48, 0.50, 0.48, 0.49, 0.47, 0.50, 0.48, 0.49,
      0.48, 0.50, 0.52, 0.54, 0.56, 0.57, 0.55, 0.53, 0.52, 0.54, 0.57, 0.60, 0.63,
      0.65, 0.66, 0.64, 0.61, 0.59, 0.62, 0.65, 0.68, 0.71, 0.74, 0.76, 0.74, 0.71,
      0.68, 0.71, 0.74, 0.78, 0.80, 0.81, 0.79, 0.81, 0.79, 0.77, 0.75, 0.72, 0.70,
      0.72, 0.74, 0.71, 0.68, 0.65, 0.62, 0.64, 0.66, 0.63, 0.60, 0.57, 0.54, 0.56,
      0.57, 0.54, 0.51, 0.49, 0.47, 0.49, 0.47, 0.49, 0.47, 0.48, 0.46, 0.48, 0.46,
      0.47, 0.46
    ];

    const UPPER_WICK = [0.5, 1.4, 0.3, 0.9, 1.8, 0.4, 1.1, 0.6, 1.6, 0.3];
    const LOWER_WICK = [0.9, 0.3, 1.5, 0.5, 0.7, 1.6, 0.3, 1.2, 0.4, 1.0];
    const CANDLE_W = isHomeV2 ? 12 : 10;
    const GAP = isHomeV2 ? 4 : 3;
    const SPEED = isHomeV2 ? 36 : 26; // px / second
    const PRICE_MIN = 0.38;
    const PRICE_MAX = 0.88;
    const BULL = isHomeV2 ? "rgba(92,255,156,0.9)" : "rgba(56,199,117,0.74)";
    const BEAR = isHomeV2 ? "rgba(255,108,108,0.9)" : "rgba(226,74,74,0.74)";
    const GRID = isHomeV2 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)";

    const CANDLES = CLOSES.map((c, i) => {
      const o = i > 0 ? CLOSES[i - 1] : c;
      const body = Math.max(Math.abs(c - o), 0.01);
      const uMul = UPPER_WICK[i % 10];
      const lMul = LOWER_WICK[i % 10];
      return {
        o,
        c,
        h: Math.max(o, c) + body * uMul * 0.5 + 0.006,
        l: Math.min(o, c) - body * lMul * 0.5 - 0.006,
        isBull: c >= o
      };
    });

    function resize() {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    function draw(timestamp) {
      const tSec = (timestamp - startTime) / 1000;
      ctx.clearRect(0, 0, W, H);

      const step = CANDLE_W + GAP;
      const tapeW = step * CANDLES.length;
      const scroll = (tSec * SPEED) % tapeW;
      const priceRange = PRICE_MAX - PRICE_MIN;

      const py = (p) => H * (1 - (p - PRICE_MIN) / priceRange);

      [0.46, 0.54, 0.62, 0.70, 0.78].forEach((gp) => {
        const y = py(gp);
        if (y < 0 || y > H) return;
        ctx.beginPath();
        ctx.setLineDash([4, 10]);
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.setLineDash([]);

      CANDLES.forEach((candle, i) => {
        let x = i * step - scroll;
        if (x < -step) x += tapeW;
        if (x < -step || x > W + step) return;

        const oY = py(candle.o);
        const cY = py(candle.c);
        const hY = py(candle.h);
        const lY = py(candle.l);
        const top = Math.min(oY, cY);
        const bodyH = Math.max(Math.abs(cY - oY), 1.5);
        const cx = x + CANDLE_W / 2;
        const col = candle.isBull ? BULL : BEAR;

        ctx.beginPath();
        ctx.moveTo(cx, hY);
        ctx.lineTo(cx, lY);
        ctx.strokeStyle = candle.isBull ? "rgba(92,255,156,0.78)" : "rgba(255,108,108,0.78)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = col;
        ctx.fillRect(x, top, CANDLE_W, bodyH);
      });

      raf = requestAnimationFrame(draw);
    }

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => { resize(); });
      ro.observe(canvas.parentElement || canvas);
    } else {
      window.addEventListener("resize", resize, { passive: true });
    }
    resize();
    raf = requestAnimationFrame(draw);

    // Keep running; home hero is always in-view and this avoids false pause on mobile.
  }
})();
