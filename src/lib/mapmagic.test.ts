import { describe, it, expect } from "vitest";
import { toMapMagicEmbed } from "./mapmagic";

describe("toMapMagicEmbed", () => {
  it("переводит /map-ссылку MapMagic в лёгкий /embed", () => {
    expect(toMapMagicEmbed("https://mapmagic.app/map?routes=0oKRjw0&embed=1", "Зубры и гравийка"))
      .toBe("https://mapmagic.app/embed?routes=0oKRjw0&title=%D0%97%D1%83%D0%B1%D1%80%D1%8B+%D0%B8+%D0%B3%D1%80%D0%B0%D0%B2%D0%B8%D0%B9%D0%BA%D0%B0");
  });

  it("отбрасывает pos/прочие параметры /map-ссылки", () => {
    expect(toMapMagicEmbed("https://mapmagic.app/map?routes=6jgyd79&b=O&pos=60.8%2C29.5%2C10&embed=1"))
      .toBe("https://mapmagic.app/embed?routes=6jgyd79");
  });

  it("обрабатывает /discover-ссылки с routes", () => {
    expect(toMapMagicEmbed("https://mapmagic.app/discover?routes=0gLpQ86&embed=1", "Сбежать из города"))
      .toContain("https://mapmagic.app/embed?routes=0gLpQ86&title=");
  });

  it("уже готовый /embed нормализует без дублей", () => {
    expect(toMapMagicEmbed("https://mapmagic.app/embed?routes=9R8OXG0&title=x", "y"))
      .toBe("https://mapmagic.app/embed?routes=9R8OXG0&title=y");
  });

  it("чужие сервисы → null (их рисуем из GPX, не через iframe)", () => {
    // Раньше дописывался embed=1, но их страницы отдают X-Frame-Options и в
    // iframe рисуются пустым окном — теперь такие маршруты идут на карту из GPX.
    expect(toMapMagicEmbed("https://example.com/route/42")).toBeNull();
    expect(toMapMagicEmbed("https://esya.ru/route/foo-n17r3oqnf9")).toBeNull();
  });

  it("mapmagic без routes → null (нечего встраивать)", () => {
    expect(toMapMagicEmbed("https://mapmagic.app/")).toBeNull();
  });

  it("мусор и пустота → null", () => {
    expect(toMapMagicEmbed("not a url")).toBeNull();
    expect(toMapMagicEmbed(null)).toBeNull();
    expect(toMapMagicEmbed(undefined)).toBeNull();
  });
});
