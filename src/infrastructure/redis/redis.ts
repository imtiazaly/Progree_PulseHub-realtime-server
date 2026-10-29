import { createClient } from "redis";
import { env } from "../../config/env.js";
import { logger } from "../logging/logger.js";

export const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on("error", (error) => {
  logger.error({ err: error }, "Redis connection error");
});
