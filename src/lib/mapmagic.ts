/**
 * Приводит ссылку MapMagic к iframe-виду `https://mapmagic.app/embed?routes=…`
 * — в отличие от `/map?…&embed=1` он не показывает баннер «Continue in the app».
 *
 * Возвращает null для не-MapMagic ссылок: их страницы отдают `X-Frame-Options`
 * и в iframe рисуются пустым окном, поэтому такие маршруты мы показываем не
 * встраиванием, а собственной картой из GPX (см. lib/map-provider.ts,
 * components/routes/RouteMap.tsx). Раньше здесь дописывался `embed=1` — это и
 * порождало пустое окно.
 *
 * Вызывается и при сохранении маршрута, и при рендере iframe — так старые
 * записи в БД с `/map?…&embed=1` чинятся без миграции данных.
 */
export function toMapMagicEmbed(url: string | null | undefined, title?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const isMapMagic = u.hostname === "mapmagic.app" || u.hostname.endsWith(".mapmagic.app");
    const routes = u.searchParams.get("routes");
    if (isMapMagic && routes) {
      const embed = new URL("https://mapmagic.app/embed");
      embed.searchParams.set("routes", routes);
      if (title) embed.searchParams.set("title", title);
      return embed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
