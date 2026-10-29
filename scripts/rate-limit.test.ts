import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isMessageRateLimited } from "../src/realtime/rate-limit.js";

describe("isMessageRateLimited", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first 10 messages within the window", () => {
    for (let i = 0; i < 10; i++) {
      expect(isMessageRateLimited("user-1")).toBe(false);
    }
  });

  it("blocks the 11th message within 10 seconds", () => {
    for (let i = 0; i < 10; i++) {
      isMessageRateLimited("user-2");
    }

    expect(isMessageRateLimited("user-2")).toBe(true);
  });

  it("allows messages again after the window expires", () => {
    for (let i = 0; i < 10; i++) {
      isMessageRateLimited("user-3");
    }

    vi.advanceTimersByTime(10_000);

    expect(isMessageRateLimited("user-3")).toBe(false);
  });

  it("tracks users independently", () => {
    for (let i = 0; i < 10; i++) {
      isMessageRateLimited("user-4");
    }

    expect(isMessageRateLimited("user-4")).toBe(true);
    expect(isMessageRateLimited("user-5")).toBe(false);
  });
});
