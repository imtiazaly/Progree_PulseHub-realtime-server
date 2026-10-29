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
