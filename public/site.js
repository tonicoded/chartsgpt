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

  // Animated chart lines in hero background
  const canvas = document.getElementById("hero-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, raf = 0;

    const LINES = [
      { color: "rgba(90,141,255,0.7)",  speed: 0.18, offset: 0,   amp: 0.13, freq: 0.0018 },
      { color: "rgba(43,213,196,0.55)", speed: 0.12, offset: 180, amp: 0.10, freq: 0.0022 },
      { color: "rgba(90,141,255,0.4)",  speed: 0.22, offset: 90,  amp: 0.08, freq: 0.0014 },
    ];

    function resize() {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width  = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    function buildPoints(line, t) {
      const pts = [];
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * W;
        const y = H * 0.5
          + Math.sin((x * line.freq) + t * line.speed + line.offset) * H * line.amp
          + Math.sin((x * line.freq * 2.3) + t * line.speed * 1.7 + line.offset * 0.6) * H * line.amp * 0.45;
        pts.push([x, y]);
      }
      return pts;
    }

    let t = 0;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      t++;
      for (const line of LINES) {
        const pts = buildPoints(line, t);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(canvas.parentElement);
    resize();
    draw();

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { if (!raf) draw(); }
        else { cancelAnimationFrame(raf); raf = 0; }
      }
    });
    io.observe(canvas);
  }
})();
