import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../src/config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-key-that-is-at-least-32-characters" },
}));

import { verifyAccessToken } from "../src/realtime/auth.js";

const secret = "test-secret-key-that-is-at-least-32-characters";

describe("verifyAccessToken", () => {
  it("accepts a valid token", () => {
    const token = jwt.sign({}, secret, {
      subject: "user-123",
      algorithm: "HS256",
    });

    expect(verifyAccessToken(token)).toEqual({ userId: "user-123" });
  });

  it("rejects an invalid signature", () => {
    const token = jwt.sign({ sub: "user-123" }, "wrong-secret");

    expect(() => verifyAccessToken(token)).toThrow();
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ sub: "user-123" }, secret, {
      expiresIn: -1,
    });

    expect(() => verifyAccessToken(token)).toThrow();
  });

  it("rejects a token without a user ID", () => {
    const token = jwt.sign({}, secret);

    expect(() => verifyAccessToken(token)).toThrow("Invalid token payload");
  });
});
