import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { logger } from "./infrastructure/logging/logger.js";
import { redisClient } from "./infrastructure/redis/redis.js";
import {
  getMessageHistorySchema,
  joinChannelSchema,
  sendMessageSchema,
} from "./realtime/schemas.js";
import { verifyAccessToken } from "./realtime/auth.js";
import { isMessageRateLimited } from "./realtime/rate-limit.js";
import { createAdapter } from "@socket.io/redis-adapter";

const MAX_STREAM_LENGTH = 10_000;

export const app = express();
export const httpServer = createServer(app);
export const io = new Server(httpServer);

let pubClient: ReturnType<typeof redisClient.duplicate> | null = null;
let subClient: ReturnType<typeof redisClient.duplicate> | null = null;

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (typeof token !== "string" || !token) {
    next(new Error("Authentication required"));
    return;
  }

  try {
    const user = verifyAccessToken(token);
    socket.data.userId = user.userId;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "PulseHub",
  });
});

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;

  void (async () => {
    try {
      await redisClient.sAdd(`pulsehub:user:${userId}:connections`, socket.id);
      await redisClient.sAdd("pulsehub:active-users", userId);
    } catch (error) {
      logger.error(
        { err: error, socketId: socket.id, userId },
        "Connection tracking failed",
      );
      socket.disconnect(true);
      return;
    }

    logger.info({ socketId: socket.id, userId }, "Client connected");
  })();

  socket.on("channel:join", async (payload, callback) => {
    try {
      const result = joinChannelSchema.safeParse(payload);

      if (!result.success) {
        callback?.({ success: false, error: "Invalid channel name" });
        return;
      }

      await socket.join(result.data.channel);
      logger.info(
        { event: "channel:join", socketId: socket.id, userId, channel: result.data.channel },
        "Channel transaction",
      );
      callback?.({ success: true, channel: result.data.channel });
    } catch (error) {
      logger.error({ err: error, socketId: socket.id }, "Channel join failed");
      callback?.({ success: false, error: "Failed to join channel" });
    }
  });

  socket.on("channel:leave", async (payload, callback) => {
    try {
      const result = joinChannelSchema.safeParse(payload);

      if (!result.success) {
        callback?.({ success: false, error: "Invalid channel name" });
        return;
      }

      await socket.leave(result.data.channel);
      logger.info(
        { event: "channel:leave", socketId: socket.id, userId, channel: result.data.channel },
        "Channel transaction",
      );
      callback?.({ success: true, channel: result.data.channel });
    } catch (error) {
      logger.error({ err: error, socketId: socket.id }, "Channel leave failed");
      callback?.({ success: false, error: "Failed to leave channel" });
    }
  });

  socket.on("channel:history", async (payload, callback) => {
    try {
      const result = getMessageHistorySchema.safeParse(payload);

      if (!result.success) {
        callback?.({ success: false, error: "Invalid history request" });
        return;
      }

      const { channel, count } = result.data;

      if (!socket.rooms.has(channel)) {
        callback?.({
          success: false,
          error: "Join the channel before requesting history",
        });
        return;
      }

      const entries = await redisClient.xRevRange(
        `pulsehub:channel:${channel}:messages`,
        "+",
        "-",
        { COUNT: count },
      );

      const messages = (entries ?? []).reverse().map(({ id, message }) => ({
        messageId: id,
        channel,
        content: message.content,
        senderId: message.senderId,
        timestamp: message.timestamp,
      }));

      callback?.({ success: true, channel, messages });
    } catch (error) {
      logger.error(
        { err: error, socketId: socket.id },
        "Message history retrieval failed",
      );
      callback?.({
        success: false,
        error: "Failed to retrieve message history",
      });
    }
  });

  socket.on("message:send", async (payload, callback) => {
    try {
      const result = sendMessageSchema.safeParse(payload);

      if (!result.success) {
        callback?.({ success: false, error: "Invalid message payload" });
        return;
      }

      const { channel, content } = result.data;

      if (!socket.rooms.has(channel)) {
        callback?.({
          success: false,
          error: "Join the channel before sending messages",
        });
        return;
      }

      if (isMessageRateLimited(userId)) {
        callback?.({
          success: false,
          error: "Rate limit exceeded. Try again later.",
        });
        return;
      }

      const timestamp = new Date().toISOString();

      const messageId = await redisClient.xAdd(
        `pulsehub:channel:${channel}:messages`,
        "*",
        {
          channel,
          content,
          senderId: userId,
          timestamp,
        },
        {
          TRIM: {
            strategy: "MAXLEN",
            strategyModifier: "~",
            threshold: MAX_STREAM_LENGTH,
          },
        },
      );

      logger.info(
        {
          event: "message:send",
          messageId,
          channel,
          senderId: userId,
          contentLength: content.length,
          timestamp,
        },
        "Message transaction",
      );

      io.to(channel).emit("message:receive", {
        messageId,
        channel,
        content,
        senderId: userId,
        timestamp,
      });

      callback?.({ success: true, messageId });
    } catch (error) {
      logger.error(
        { err: error, socketId: socket.id },
        "Message processing failed",
      );
      callback?.({ success: false, error: "Failed to send message" });
    }
  });

  socket.on("disconnect", (reason) => {
    void (async () => {
      try {
        await redisClient.sRem(
          `pulsehub:user:${userId}:connections`,
          socket.id,
        );

        const remainingConnections = await redisClient.sCard(
          `pulsehub:user:${userId}:connections`,
        );

        if (remainingConnections === 0) {
          await redisClient.sRem("pulsehub:active-users", userId);
        }
      } catch (error) {
        logger.error(
          { err: error, socketId: socket.id, userId, reason },
          "Disconnect cleanup failed",
        );
      }

      logger.info(
        { socketId: socket.id, userId, reason },
        "Client disconnected",
      );
    })();
  });
});

export async function startServer(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  logger.info("Redis connected successfully");

  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };

    const onError = (error: Error) => {
      httpServer.off("listening", onListening);
      reject(error);
    };

    httpServer.once("listening", onListening);
    httpServer.once("error", onError);
    httpServer.listen(env.PORT, env.HOST);
  });

  pubClient = redisClient.duplicate();
  subClient = redisClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);

  io.adapter(createAdapter(pubClient, subClient));

  logger.info("Redis Pub/Sub adapter configured");

  logger.info({ host: env.HOST, port: env.PORT }, "PulseHub server started");
}

let isShuttingDown = false;

export async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Graceful shutdown started");

  try {
    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        io.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    if (redisClient.isOpen) {
      if (pubClient?.isOpen) await pubClient.quit();
      if (subClient?.isOpen) await subClient.quit();
      await redisClient.quit();
    }

    logger.info("PulseHub shut down successfully");
  } catch (error) {
    logger.error({ err: error }, "Graceful shutdown failed");
    process.exitCode = 1;
  }
}

if (process.env.NODE_ENV !== "test") {
  void startServer().catch((error) => {
    logger.error({ err: error }, "PulseHub startup failed");
    process.exitCode = 1;
  });

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
