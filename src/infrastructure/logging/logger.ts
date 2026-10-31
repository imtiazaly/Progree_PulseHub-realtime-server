import pino from "pino";
import { env } from "../../config/env.js";

const fileStream = pino.destination({
  dest: "./logs/pulsehub.log",
  sync: false,
  mkdir: true,
});

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "password",
        "token",
        "authorization",
        "cookie",
        "headers.authorization",
      ],
      censor: "[REDACTED]",
    },
  },
  pino.multistream([{ stream: process.stdout }, { stream: fileStream }]),
);