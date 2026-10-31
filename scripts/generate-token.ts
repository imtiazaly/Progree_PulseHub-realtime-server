import "dotenv/config";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

const userId = process.argv[2] ?? "demo-user";

const token = jwt.sign({}, env.JWT_SECRET, {
  subject: userId,
  algorithm: "HS256",
  expiresIn: "1h",
});

console.log(token);
