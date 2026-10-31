import "dotenv/config";
import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

const serverUrl = `http://${env.HOST}:${env.PORT}`;
const channel = "general";

function generateToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    algorithm: "HS256",
  });
}

const sender = io(serverUrl, {
  auth: { token: generateToken("user-sender") },
});

const receiver = io(serverUrl, {
  auth: { token: generateToken("user-receiver") },
});

async function joinChannel(socket: typeof sender, name: string) {
  return new Promise<void>((resolve, reject) => {
    socket.emit(
      "channel:join",
      { channel },
      (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          reject(new Error(response.error ?? "Channel join failed"));
          return;
        }
        console.log(`[${name}] joined channel: ${channel}`);
        resolve();
      },
    );
  });
}

async function testMessaging() {
  try {
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        sender.once("connect", resolve);
        sender.once("connect_error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        receiver.once("connect", resolve);
        receiver.once("connect_error", reject);
      }),
    ]);

    console.log("Both clients authenticated & connected via Socket.IO.");

    await Promise.all([
      joinChannel(sender, "Sender"),
      joinChannel(receiver, "Receiver"),
    ]);

    const messagePromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Message reception timed out")),
        5000,
      );

      receiver.once("message:receive", (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });

    sender.emit(
      "message:send",
      { channel, content: "Hello from PulseHub Single Instance!" },
      (ack: { success: boolean; error?: string; messageId?: string }) => {
        console.log("Send acknowledgement:", ack);
      },
    );

    const received = await messagePromise;
    console.log("Receiver received message:", received);
    console.log("\n>>> SINGLE-INSTANCE VERIFICATION PASSED <<<\n");
  } finally {
    sender.disconnect();
    receiver.disconnect();
  }
}

testMessaging().catch((error: unknown) => {
  console.error("Messaging test failed:", error);
  process.exit(1);
});
