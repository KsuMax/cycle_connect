import { describe, it, expect } from "vitest";
import { extractLinks, detectLinks } from "./link-detect";

describe("extractLinks", () => {
  it("находит все http(s)-ссылки в тексте", () => {
    const text = "трек тут https://nakarte.me/#m=10/60/30 а фото в вк https://vk.com/id123";
    expect(extractLinks(text)).toEqual([
      "https://nakarte.me/#m=10/60/30",
      "https://vk.com/id123",
    ]);
  });

  it("дедуплицирует повторяющиеся ссылки", () => {
    const text = "https://strava.com/routes/1 см. https://strava.com/routes/1";
    expect(extractLinks(text)).toEqual(["https://strava.com/routes/1"]);
  });

  it("возвращает пустой массив, если ссылок нет", () => {
    expect(extractLinks("просто текст без ссылок")).toEqual([]);
  });
});

describe("detectLinks", () => {
  it("распознаёт известные домены трек-сервисов", async () => {
    const text = [
      "https://nakarte.me/#m=10/60/30",
      "https://strava.com/routes/123",
      "https://www.komoot.com/tour/456",
      "https://wikiloc.com/trails/1",
      "https://www.openstreetmap.org/relation/1",
      "https://mapmagic.app/embed?routes=abc",
      "https://example.com/track.gpx",
    ].join(" ");

    const links = await detectLinks(text);
    expect(links.map((l) => l.type)).toEqual([
      "nakarte",
      "strava",
      "komoot",
      "wikiloc",
      "osm",
      "mapmagic",
      "gpx",
    ]);
  });

  it("помечает форумные вложения отдельным типом", async () => {
    const links = await detectLinks(
      "трек во вложении https://velopiter.spb.ru/applications/core/interface/file/attachment.php?id=123"
    );
    expect(links).toEqual([
      {
        url: "https://velopiter.spb.ru/applications/core/interface/file/attachment.php?id=123",
        type: "forum-attachment",
      },
    ]);
  });

  it("помечает нераспознанные ссылки как unknown без похода в сеть", async () => {
    const links = await detectLinks("подробности тут https://example.com/route-42");
    expect(links).toEqual([{ url: "https://example.com/route-42", type: "unknown" }]);
  });
});
