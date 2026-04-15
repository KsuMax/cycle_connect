import { describe, it, expect } from "vitest";
import { dbToRoute, dbToEvent, dbToUser } from "./transforms";
import type { DbProfile, DbRoute, DbEvent } from "./supabase";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const profile: DbProfile = {
  id: "u1",
  name: "Иван Петров",
  username: "ivanp",
  bio: null,
  avatar_url: "https://example.com/avatar.jpg",
  km_total: 1200,
  routes_count: 5,
  events_count: 2,
  created_at: "2024-01-01T00:00:00Z",
};

const route: DbRoute = {
  id: "r1",
  author_id: "u1",
  title: "Горный маршрут",
  description: "Красивый маршрут в горах",
  region: "Краснодарский край",
  distance_km: 85,
  elevation_m: 1500,
  duration_min: 240,
  difficulty: "hard",
  surface: ["gravel", "dirt"],
  bike_types: ["mountain"],
  route_types: ["gravel", "mtb"],
  tags: ["горы", "живописный"],
  mapmagic_url: null,
  mapmagic_embed: null,
  cover_url: "https://example.com/cover.jpg",
  gpx_path: null,
  gpx_updated_at: null,
  exit_points_status: "unknown",
  likes_count: 42,
  riders_today: 3,
  created_at: "2024-03-15T10:00:00Z",
  author: profile,
  route_images: [{ url: "https://example.com/img1.jpg" }, { url: "https://example.com/img2.jpg" }],
};

const event: DbEvent = {
  id: "e1",
  route_id: "r1",
  organizer_id: "u1",
  title: "Весенний марафон",
  description: "Групповая поездка",
  start_date: "2024-05-01",
  end_date: "2024-05-03",
  max_participants: 20,
  likes_count: 15,
  is_private: false,
  cover_url: null,
  created_at: "2024-04-01T00:00:00Z",
  organizer: profile,
  route,
  event_days: [
    {
      id: "d1", event_id: "e1", day_number: 1,
      date: "2024-05-01", title: "День первый",
      distance_km: 40, start_point: "Сочи", end_point: "Адлер",
      description: "Старт от вокзала", surface_note: null,
    },
  ],
  event_participants: [
    { user_id: "u2", profile: { ...profile, id: "u2", name: "Мария Сидорова" } },
  ],
};

// ─── dbToUser ─────────────────────────────────────────────────────────────────

describe("dbToUser", () => {
  it("maps all fields correctly", () => {
    const user = dbToUser(profile);
    expect(user.id).toBe("u1");
    expect(user.name).toBe("Иван Петров");
    expect(user.initials).toBe("ИП");
    expect(user.avatar_url).toBe("https://example.com/avatar.jpg");
    expect(user.km_total).toBe(1200);
    expect(user.routes_count).toBe(5);
    expect(user.events_count).toBe(2);
  });

  it("uses default color #7C5CFC when not specified", () => {
    expect(dbToUser(profile).color).toBe("#7C5CFC");
  });

  it("applies custom color", () => {
    expect(dbToUser(profile, "#F4632A").color).toBe("#F4632A");
  });

  it("generates initials from single-word name", () => {
    const user = dbToUser({ ...profile, name: "Анна" });
    expect(user.initials).toBe("А");
  });

  it("truncates initials to 2 chars for long names", () => {
    const user = dbToUser({ ...profile, name: "Иван Александр Петров" });
    expect(user.initials).toBe("ИА");
  });
});

// ─── dbToRoute ────────────────────────────────────────────────────────────────

describe("dbToRoute", () => {
  it("maps scalar fields", () => {
    const r = dbToRoute(route);
    expect(r.id).toBe("r1");
    expect(r.title).toBe("Горный маршрут");
    expect(r.distance_km).toBe(85);
    expect(r.elevation_m).toBe(1500);
    expect(r.difficulty).toBe("hard");
    expect(r.likes).toBe(42);
    expect(r.riders_today).toBe(3);
  });

  it("maps optional fields", () => {
    const r = dbToRoute(route);
    expect(r.cover_url).toBe("https://example.com/cover.jpg");
    expect(r.images).toEqual(["https://example.com/img1.jpg", "https://example.com/img2.jpg"]);
  });

  it("maps null cover_url to undefined", () => {
    const r = dbToRoute({ ...route, cover_url: null });
    expect(r.cover_url).toBeUndefined();
  });

  it("maps author via dbToUser with orange colour", () => {
    const r = dbToRoute(route);
    expect(r.author.id).toBe("u1");
    expect(r.author.name).toBe("Иван Петров");
    expect(r.author.color).toBe("#F4632A");
  });

  it("uses fallback author when author join is missing", () => {
    const r = dbToRoute({ ...route, author: undefined });
    expect(r.author.id).toBe("u1"); // falls back to author_id
    expect(r.author.name).toBe("Участник");
  });

  it("maps array fields", () => {
    const r = dbToRoute(route);
    expect(r.surface).toEqual(["gravel", "dirt"]);
    expect(r.bike_types).toEqual(["mountain"]);
    expect(r.route_types).toEqual(["gravel", "mtb"]);
    expect(r.tags).toEqual(["горы", "живописный"]);
  });
});

// ─── dbToEvent ────────────────────────────────────────────────────────────────

describe("dbToEvent", () => {
  it("maps scalar fields", () => {
    const e = dbToEvent(event);
    expect(e.id).toBe("e1");
    expect(e.title).toBe("Весенний марафон");
    expect(e.start_date).toBe("2024-05-01");
    expect(e.end_date).toBe("2024-05-03");
    expect(e.likes).toBe(15);
    expect(e.is_private).toBe(false);
    expect(e.max_participants).toBe(20);
  });

  it("maps organizer", () => {
    const e = dbToEvent(event);
    expect(e.organizer.id).toBe("u1");
    expect(e.organizer.color).toBe("#7C5CFC");
  });

  it("uses fallback organizer when join is missing", () => {
    const e = dbToEvent({ ...event, organizer: undefined });
    expect(e.organizer.id).toBe("u1"); // organizer_id
    expect(e.organizer.name).toBe("Организатор");
  });

  it("maps nested route", () => {
    const e = dbToEvent(event);
    expect(e.route.id).toBe("r1");
    expect(e.route.title).toBe("Горный маршрут");
  });

  it("uses empty route when route join is missing", () => {
    const e = dbToEvent({ ...event, route: undefined });
    expect(e.route.id).toBe("");
  });

  it("maps event days", () => {
    const e = dbToEvent(event);
    expect(e.days).toHaveLength(1);
    expect(e.days[0].day).toBe(1);
    expect(e.days[0].title).toBe("День первый");
    expect(e.days[0].start_point).toBe("Сочи");
    expect(e.days[0].distance_km).toBe(40);
  });

  it("maps participants", () => {
    const e = dbToEvent(event);
    expect(e.participants).toHaveLength(1);
    expect(e.participants[0].id).toBe("u2");
    expect(e.participants[0].name).toBe("Мария Сидорова");
  });

  it("returns empty participants when none present", () => {
    const e = dbToEvent({ ...event, event_participants: [] });
    expect(e.participants).toEqual([]);
  });

  it("falls back to empty string for null dates", () => {
    const e = dbToEvent({ ...event, start_date: null, end_date: null });
    expect(e.start_date).toBe("");
    expect(e.end_date).toBe("");
  });
});
