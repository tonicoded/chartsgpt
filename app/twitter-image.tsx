import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "ChartsGPT — AI-powered chart analysis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function loadFont(relPath: string) {
  return readFileSync(join(process.cwd(), "public", relPath));
}

export default async function Image() {
  const fontBold = loadFont("Unbounded-Black.ttf");
  const fontSemi = loadFont("Unbounded-SemiBold.ttf");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          backgroundColor: "#03060e",
          backgroundImage:
            "radial-gradient(circle at 10% 15%, rgba(124,92,255,0.42) 0%, transparent 60%), radial-gradient(circle at 95% 20%, rgba(39,212,255,0.34) 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 35%)",
          color: "rgba(255,255,255,0.96)"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            borderRadius: 34,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(10,12,18,0.72)",
            padding: 46
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background:
                  "radial-gradient(circle at 30% 30%, rgba(39,212,255,0.90) 0%, rgba(124,92,255,0.90) 100%)",
                boxShadow: "0 18px 46px rgba(0,0,0,0.45)"
              }}
            />
            <div style={{ fontSize: 22, fontFamily: "UnboundedSemi", letterSpacing: -0.4, opacity: 0.9 }}>
              ChartsGPT
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 72,
              lineHeight: 1.02,
              fontFamily: "UnboundedBold",
              letterSpacing: -1.5
            }}
          >
            <span>AI chart analysis</span>
            <span>in seconds.</span>
          </div>
          <div style={{ fontSize: 26, fontFamily: "UnboundedSemi", lineHeight: 1.35, opacity: 0.88, maxWidth: 900 }}>
            Scan any trading chart screenshot and get clean output: key levels, scenarios, triggers, and invalidation.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "UnboundedBold", data: fontBold, style: "normal" },
        { name: "UnboundedSemi", data: fontSemi, style: "normal" }
      ]
    }
  );
}
