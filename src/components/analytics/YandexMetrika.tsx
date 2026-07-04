"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { YM_COUNTER_ID as COUNTER_ID } from "@/lib/ym";

/** Fires ym('hit') on every client-side navigation (SPA) */
function RouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const url = pathname + (searchParams.toString() ? `?${searchParams}` : "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ym?.(COUNTER_ID, "hit", url, { referrer: document.referrer });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Yandex Metrika loader.
 *
 * `nonce` comes from the per-request CSP nonce set in middleware.ts and
 * forwarded from app/layout.tsx via `headers().get("x-nonce")`. Without it,
 * the inline `ym(...)` snippet would be blocked by the production CSP
 * (`script-src 'self' 'nonce-X' 'strict-dynamic' ...`).
 */
export function YandexMetrika({ nonce }: { nonce?: string }) {
  return (
    <>
      {/* Metrika tag loader — afterInteractive so it never blocks render */}
      <Script
        id="ym-loader"
        strategy="afterInteractive"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');
ym(${COUNTER_ID},'init',{
  webvisor:true,
  clickmap:true,
  accurateTrackBounce:true,
  trackLinks:true
});`,
        }}
      />

      {/* Fallback pixel for users with JS disabled */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://mc.yandex.ru/watch/${COUNTER_ID}`}
          style={{ position: "absolute", left: "-9999px" }}
          alt=""
        />
      </noscript>

      {/* useSearchParams() needs Suspense boundary */}
      <Suspense fallback={null}>
        <RouteTracker />
      </Suspense>
    </>
  );
}
