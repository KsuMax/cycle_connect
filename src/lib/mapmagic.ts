/**
 * Приводит ссылку на карту к iframe-виду.
 *
 * MapMagic: строит лёгкий embed `https://mapmagic.app/embed?routes=…&title=…` —
 * в отличие от `/map?…&embed=1`, он не показывает баннер «Continue in the app».
 * Прочие сервисы: прежнее поведение — дописываем `embed=1` (Komoot и другие
 * своего embed не дают, их не трогаем).
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
    u.searchParams.set("embed", "1");
    return u.toString();
  } catch {
    return null;
  }
}
