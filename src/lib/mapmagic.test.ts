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

  it("чужие сервисы не трогает, кроме прежнего embed=1", () => {
    expect(toMapMagicEmbed("https://example.com/route/42"))
      .toBe("https://example.com/route/42?embed=1");
  });

  it("mapmagic без routes ведёт себя как раньше", () => {
    expect(toMapMagicEmbed("https://mapmagic.app/")).toBe("https://mapmagic.app/?embed=1");
  });

  it("мусор и пустота → null", () => {
    expect(toMapMagicEmbed("not a url")).toBeNull();
    expect(toMapMagicEmbed(null)).toBeNull();
    expect(toMapMagicEmbed(undefined)).toBeNull();
  });
});
