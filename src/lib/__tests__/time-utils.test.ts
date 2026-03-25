import { describe, it, expect, vi, afterEach } from "vitest";
import { timeAgo, formatDate, formatElapsedTime } from "../time-utils";

describe("timeAgo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns 'just now' for <60s", () => {
    expect(timeAgo(Date.now() - 30_000)).toBe("just now");
  });

  it("returns minutes for 60s-3600s", () => {
    expect(timeAgo(Date.now() - 300_000)).toBe("5m ago");
  });

  it("returns hours for 3600s-86400s", () => {
    expect(timeAgo(Date.now() - 7_200_000)).toBe("2h ago");
  });

  it("returns days for >86400s", () => {
    expect(timeAgo(Date.now() - 172_800_000)).toBe("2d ago");
  });
});

describe("formatDate", () => {
  it("formats date as short month", () => {
    const result = formatDate(new Date("2026-03-25").getTime());
    expect(result).toContain("Mar");
    expect(result).toContain("25");
    expect(result).toContain("2026");
  });
});

describe("formatElapsedTime", () => {
  it("formats seconds", () => {
    expect(formatElapsedTime(Date.now() - 45_000)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsedTime(Date.now() - 195_000)).toBe("3m 15s");
  });

  it("formats hours and minutes", () => {
    expect(formatElapsedTime(Date.now() - 3_900_000)).toBe("1h 5m");
  });

  it("handles future timestamps gracefully", () => {
    expect(formatElapsedTime(Date.now() + 10_000)).toBe("0s");
  });
});
