import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { logger } from "./infrastructure/logging/logger.js";
import { redisClient } from "./infrastructure/redis/redis.js";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "PulseHub",
  });
});

io.on("connection", async (socket) => {
  await redisClient.sAdd("pulsehub:active-users", socket.id);

  logger.info({ socketId: socket.id }, "Client connected");

  socket.on("disconnect", async (reason) => {
    await redisClient.sRem("pulsehub:active-users", socket.id);

    logger.info({ socketId: socket.id, reason }, "Client disconnected");
  });
});

await redisClient.connect();
logger.info("Redis connected successfully");

httpServer.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, "PulseHub server started");
});


let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Graceful shutdown started");

  try {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });

    if (redisClient.isOpen) {
      await redisClient.quit();
    }

    logger.info("PulseHub shut down successfully");
  } catch (error) {
    logger.error({ err: error }, "Graceful shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
