import { describe, it, expect } from "vitest";
import { mapProviderName, isEmbeddableMapUrl } from "./map-provider";

describe("mapProviderName", () => {
  it("называет известные планировщики", () => {
    expect(mapProviderName("https://mapmagic.app/map?routes=x")).toBe("MapMagic");
    expect(mapProviderName("https://www.komoot.com/tour/123")).toBe("Komoot");
    expect(mapProviderName("https://www.strava.com/routes/9")).toBe("Strava");
    expect(mapProviderName("https://nakarte.me/#foo")).toBe("nakarte");
  });

  it("для незнакомых сервисов возвращает хост без www", () => {
    expect(mapProviderName("https://esya.ru/route/foo-n17r3oqnf9")).toBe("esya.ru");
    expect(mapProviderName("https://www.example.org/x")).toBe("example.org");
  });

  it("мусор и пустота → null", () => {
    expect(mapProviderName("not a url")).toBeNull();
    expect(mapProviderName(null)).toBeNull();
    expect(mapProviderName(undefined)).toBeNull();
  });
});

describe("isEmbeddableMapUrl", () => {
  it("только MapMagic можно встроить в iframe", () => {
    expect(isEmbeddableMapUrl("https://mapmagic.app/embed?routes=x")).toBe(true);
    expect(isEmbeddableMapUrl("https://mapmagic.app/map?routes=x&embed=1")).toBe(true);
  });

  it("остальные — нет (X-Frame-Options → пустое окно)", () => {
    expect(isEmbeddableMapUrl("https://esya.ru/route/foo")).toBe(false);
    expect(isEmbeddableMapUrl("https://www.komoot.com/tour/1")).toBe(false);
    expect(isEmbeddableMapUrl(null)).toBe(false);
    expect(isEmbeddableMapUrl("garbage")).toBe(false);
  });
});
