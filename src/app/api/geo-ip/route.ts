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
    // ipwho.is is HTTPS and accessible from RU without an API key.
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,latitude,longitude,city,region`,
      { next: { revalidate: 300 } }, // cache 5 min — IP rarely changes mid-session
    );
    if (!res.ok) throw new Error("ipwho.is error");
    const data = await res.json() as {
      success: boolean;
      latitude?: number;
      longitude?: number;
      city?: string;
      region?: string;
    };
    if (!data.success || typeof data.latitude !== "number" || typeof data.longitude !== "number") {
      throw new Error("ipwho.is no result");
    }
    return NextResponse.json({
      lat: data.latitude,
      lng: data.longitude,
      city: data.city ?? null,
      region: data.region ?? null,
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
