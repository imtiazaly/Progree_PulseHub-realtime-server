import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AuthenticatedUser {
  userId: string;
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  });

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    decoded.sub.trim().length === 0
  ) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: decoded.sub,
  };
}
