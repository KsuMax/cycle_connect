// Read-only production check. Pass a route cover and an avatar Storage URL.
// A unique query forces a cold optimizer request, so cache cannot hide DNS errors.
const sources = process.argv.slice(2);
if (!sources.length) {
  console.error('Usage: node scripts/check-public-images.mjs <public-storage-url> [...]');
  process.exit(1);
}
const site = process.env.SITE_URL || 'https://cycleconnect.cc';
for (const [index, source] of sources.entries()) {
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.hostname !== 'api.cycleconnect.cc' ||
      !url.pathname.startsWith('/storage/v1/object/public/')) {
    throw new Error('Expected a public CycleConnect Storage image URL');
  }
  url.searchParams.set('cc_image_check', `${Date.now()}-${index}`);
  const optimized = new URL('/_next/image', site);
  optimized.searchParams.set('url', url.href);
  optimized.searchParams.set('w', '640');
  optimized.searchParams.set('q', '75');
  for (const [kind, target] of [['original', url], ['optimized', optimized]]) {
    const response = await fetch(target, { signal: AbortSignal.timeout(20000) });
    const type = response.headers.get('content-type') || '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || !type.startsWith('image/') || bytes.length < 8) {
      throw new Error(`Image ${index + 1} ${kind}: HTTP ${response.status}, ${type}`);
    }
    console.log(`Image ${index + 1} ${kind}: PASS (${response.status}, ${type})`);
  }
}
