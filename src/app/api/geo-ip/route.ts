import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side IP geolocation fallback.
 * Called by the client when navigator.geolocation fails (POSITION_UNAVAILABLE / TIMEOUT).
 * Uses ip-api.com which is accessible from Russia.
 */
export async function GET(req: NextRequest) {
  // Prefer forwarded IP (behind Vercel/nginx proxy)
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : (req as unknown as { ip?: string }).ip;

  // Don't try to geolocate localhost — return a clear error so the caller can show a manual-entry UI
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return NextResponse.json({ error: "local" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,lat,lon,city,regionName`,
      { next: { revalidate: 300 } }, // cache 5 min — IP rarely changes mid-session
    );
    if (!res.ok) throw new Error("ip-api error");
    const data = await res.json() as { status: string; lat: number; lon: number; city?: string; regionName?: string };
    if (data.status !== "success") throw new Error("ip-api no result");
    return NextResponse.json({
      lat: data.lat,
      lng: data.lon,
      city: data.city ?? null,
      region: data.regionName ?? null,
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
