import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "CycleConnect — велосипедные маршруты, поездки и клубы";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Every glyph we render — passed to Google Fonts so we get one tiny woff2
// per weight instead of the full Cyrillic subset.
const TEXT =
  "CycleConnectcycleconnect.ccМаршрутыипоездкидлявелосипедистов" +
  "Находисотзывамиприсоединяйсяклубамделисьотчётамиопокатушках" +
  "ПоездкиКлубы";

async function loadFont(weight: 600 | 800): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(TEXT)}&display=swap`;
  const css = await fetch(cssUrl, {
    headers: {
      // Old Android UA tricks Google into serving the font as TTF instead of
      // woff2 — satori (next/og) cannot parse woff2.
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 2.3) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0",
    },
    next: { revalidate: 60 * 60 * 24 },
  }).then((r) => r.text());
  const match = css.match(/url\((https:\/\/[^)]+)\)/);
  if (!match) throw new Error("Inter font URL not found in Google Fonts CSS");
  return fetch(match[1], { next: { revalidate: 60 * 60 * 24 } }).then((r) =>
    r.arrayBuffer(),
  );
}

export default async function OpenGraphImage() {
  const [bold, semi] = await Promise.all([loadFont(800), loadFont(600)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          color: "#fff",
          fontFamily: "Inter",
          backgroundImage:
            "linear-gradient(135deg, #F4632A 0%, #E05520 35%, #7C5CFC 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Bike watermark — bottom-right, low opacity */}
        <svg
          width={560}
          height={560}
          viewBox="0 0 100 100"
          fill="none"
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            position: "absolute",
            right: -60,
            bottom: -60,
            opacity: 0.14,
          }}
        >
          <circle cx={22} cy={70} r={18} />
          <circle cx={78} cy={70} r={18} />
          <path d="M22 70 L45 45 L60 70 M45 45 L55 30 L65 30 M60 70 L72 38 L60 38" />
        </svg>

        {/* Top: brand + domain */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontWeight: 800,
            fontSize: 36,
            letterSpacing: -0.5,
          }}
        >
          <span>CycleConnect</span>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: "#fff",
              opacity: 0.85,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 24, opacity: 0.85 }}>
            cycleconnect.cc
          </span>
        </div>

        {/* Middle: headline + sub + chips */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 88,
              lineHeight: 1.02,
              letterSpacing: -2,
              maxWidth: 900,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Маршруты и поездки</span>
            <span>для велосипедистов</span>
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 30,
              opacity: 0.92,
              maxWidth: 780,
              lineHeight: 1.3,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Находи маршруты с отзывами,</span>
            <span>присоединяйся к клубам, делись отчётами о покатушках</span>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
            {["Маршруты", "Поездки", "Клубы"].map((label) => (
              <div
                key={label}
                style={{
                  padding: "12px 22px",
                  background: "rgba(255,255,255,0.18)",
                  border: "1px solid rgba(255,255,255,0.28)",
                  borderRadius: 999,
                  fontSize: 24,
                  fontWeight: 600,
                  display: "flex",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom-right: domain */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            fontSize: 26,
            fontWeight: 600,
            opacity: 0.85,
          }}
        >
          cycleconnect.cc
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: bold, weight: 800, style: "normal" },
        { name: "Inter", data: semi, weight: 600, style: "normal" },
      ],
    },
  );
}
