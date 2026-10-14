import { describe, it, expect } from "vitest";
import { todayIso, toIsoDay } from "@/lib/isoDate";

describe("database dates", () => {
  it("todayIso is YYYY-MM-DD in local time", () => {
    expect(todayIso(new Date(2026, 9, 14))).toBe("2026-10-14");
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("keeps ISO dates and timestamps", () => {
    expect(toIsoDay("2026-10-14")).toBe("2026-10-14");
    expect(toIsoDay("2026-10-14T09:30:00Z")).toBe("2026-10-14");
  });
  it("converts the day/month/year strings older browser data holds", () => {
    expect(toIsoDay("14/10/2026")).toBe("2026-10-14");
    expect(toIsoDay("4/1/2026")).toBe("2026-01-04");
  });
  it("returns null for anything else", () => {
    expect(toIsoDay("")).toBeNull();
    expect(toIsoDay(undefined)).toBeNull();
    expect(toIsoDay("yesterday")).toBeNull();
  });
});
