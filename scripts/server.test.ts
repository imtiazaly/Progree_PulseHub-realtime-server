import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import jwt from "jsonwebtoken";

const { redisClientMock } = vi.hoisted(() => ({
  redisClientMock: {
    isOpen: false,
    connect: vi.fn(),
    quit: vi.fn(),
    sAdd: vi.fn(),
    sRem: vi.fn(),
    sCard: vi.fn(),
    xAdd: vi.fn(),
    xRevRange: vi.fn(),
  },
}));

vi.mock("../src/infrastructure/redis/redis.js", () => ({
  redisClient: redisClientMock,
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-key-that-is-at-least-32-characters",
    HOST: "127.0.0.1",
    PORT: 0,
    LOG_LEVEL: "silent",
  },
}));

vi.mock("../src/infrastructure/logging/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const secret = "test-secret-key-that-is-at-least-32-characters";
let address: string;
let clientSockets: Socket[] = [];
let closeServer: (() => Promise<void>) | undefined;

function createToken(subject = "user-123") {
  return jwt.sign({}, secret, {
    subject,
    algorithm: "HS256",
  });
}

function connectClient(token?: string): Socket {
  const socket = createClient(address, {
    forceNew: true,
    reconnection: false,
    timeout: 3000,
    auth: token ? { token } : {},
  });

  clientSockets.push(socket);
  return socket;
}

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}

function waitForConnectError(socket: Socket): Promise<Error> {
  return new Promise((resolve, reject) => {
    socket.once("connect_error", resolve);
    socket.once("connect", () => reject(new Error("Unexpected connection")));
  });
}

function joinChannel(socket: Socket, channel: string): Promise<unknown> {
  return new Promise((resolve) => {
    socket.emit("channel:join", { channel }, resolve);
  });
}

beforeAll(async () => {
  redisClientMock.sAdd.mockResolvedValue(1);
  redisClientMock.sRem.mockResolvedValue(1);
  redisClientMock.sCard.mockResolvedValue(0);
  redisClientMock.xAdd.mockResolvedValue("1-0");

  const { httpServer, startServer, shutdown } =
    await import("../src/server.js");

  await startServer();

  const serverAddress = httpServer.address();
  if (!serverAddress || typeof serverAddress === "string") {
    throw new Error("Could not determine test server address");
  }

  address = `http://127.0.0.1:${serverAddress.port}`;
  closeServer = async () => {
    await shutdown("SIGTERM");
  };
});

afterAll(async () => {
  for (const socket of clientSockets) {
    socket.disconnect();
  }

  if (closeServer) {
    await closeServer();
  }
});

describe("Socket.IO integration", () => {
  it("rejects a connection without a token", async () => {
    const socket = connectClient();
    await expect(waitForConnectError(socket)).resolves.toMatchObject({
      message: "Authentication required",
    });
  });

  it("rejects an invalid token", async () => {
    const socket = connectClient("invalid-token");
    await expect(waitForConnectError(socket)).resolves.toMatchObject({
      message: "Invalid or expired token",
    });
  });

  it("accepts a valid token and joins a channel", async () => {
    const socket = connectClient(createToken());
    await waitForConnect(socket);

    await expect(joinChannel(socket, "general")).resolves.toEqual({
      success: true,
      channel: "general",
    });
  });

  it("returns channel history in chronological order", async () => {
    const socket = connectClient(createToken());
    await waitForConnect(socket);
    await joinChannel(socket, "general");

    redisClientMock.xRevRange.mockResolvedValueOnce([
      {
        id: "2-0",
        message: {
          content: "Second",
          senderId: "user-123",
          timestamp: "2026-10-29T08:00:02.000Z",
        },
      },
      {
        id: "1-0",
        message: {
          content: "First",
          senderId: "user-123",
          timestamp: "2026-10-29T08:00:01.000Z",
        },
      },
    ]);

    const result = await new Promise<any>((resolve) => {
      socket.emit(
        "channel:history",
        { channel: "general", count: 50 },
        resolve,
      );
    });

    expect(result.success).toBe(true);
    expect(result.messages.map((message: any) => message.content)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("rejects history requests from clients that have not joined the channel", async () => {
    const socket = connectClient(createToken());
    await waitForConnect(socket);

    const result = await new Promise<any>((resolve) => {
      socket.emit("channel:history", { channel: "general" }, resolve);
    });

    expect(result).toEqual({
      success: false,
      error: "Join the channel before requesting history",
    });
    expect(redisClientMock.xRevRange).not.toHaveBeenCalled();
  });

  it("returns an empty list when channel history is empty", async () => {
    const socket = connectClient(createToken());
    await waitForConnect(socket);
    await joinChannel(socket, "general");

    redisClientMock.xRevRange.mockResolvedValueOnce([]);

    const result = await new Promise<any>((resolve) => {
      socket.emit("channel:history", { channel: "general" }, resolve);
    });

    expect(result).toEqual({
      success: true,
      channel: "general",
      messages: [],
    });
  });

  it("persists and broadcasts a message to the channel", async () => {
    const sender = connectClient(createToken("sender-1"));
    const receiver = connectClient(createToken("receiver-1"));

    await Promise.all([waitForConnect(sender), waitForConnect(receiver)]);
    await Promise.all([
      joinChannel(sender, "general"),
      joinChannel(receiver, "general"),
    ]);

    const received = new Promise<{
      messageId: string;
      channel: string;
      content: string;
      senderId: string;
    }>((resolve) => receiver.once("message:receive", resolve));

    const result = await new Promise<{ success: boolean; messageId?: string }>(
      (resolve) => {
        sender.emit(
          "message:send",
          { channel: "general", content: "Hello PulseHub" },
          resolve,
        );
      },
    );

    expect(result).toEqual({ success: true, messageId: "1-0" });
    expect(redisClientMock.xAdd).toHaveBeenCalledOnce();

    await expect(received).resolves.toMatchObject({
      messageId: "1-0",
      channel: "general",
      content: "Hello PulseHub",
      senderId: "sender-1",
    });
  });
});
