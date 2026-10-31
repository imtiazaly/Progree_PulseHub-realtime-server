import "dotenv/config";
import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

const INSTANCE_1 = "http://127.0.0.1:3000";
const INSTANCE_2 = "http://127.0.0.1:3001";
const TEST_CHANNEL = "distributed-cluster";

function generateToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    algorithm: "HS256",
  });
}

const clientOnServer1 = io(INSTANCE_1, {
  auth: { token: generateToken("user-cluster-1") },
});

const clientOnServer2 = io(INSTANCE_2, {
  auth: { token: generateToken("user-cluster-2") },
});

async function joinChannel(socket: typeof clientOnServer1, name: string) {
  return new Promise<void>((resolve, reject) => {
    socket.emit(
      "channel:join",
      { channel: TEST_CHANNEL },
      (res: { success: boolean; error?: string }) => {
        if (!res.success) {
          reject(new Error(`${name} failed to join: ${res.error}`));
          return;
        }
        console.log(`[${name}] Joined channel: ${TEST_CHANNEL}`);
        resolve();
      },
    );
  });
}

async function verifyMultiInstance() {
  try {
    console.log("Connecting Client 1 to Instance 1 (Port 3000)...");
    console.log("Connecting Client 2 to Instance 2 (Port 3001)...");

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        clientOnServer1.once("connect", resolve);
        clientOnServer1.once("connect_error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        clientOnServer2.once("connect", resolve);
        clientOnServer2.once("connect_error", reject);
      }),
    ]);

    console.log(
      "SUCCESS: Both clients connected to different server instances!",
    );

    await Promise.all([
      joinChannel(clientOnServer1, "Client 1 (Instance 1)"),
      joinChannel(clientOnServer2, "Client 2 (Instance 2)"),
    ]);

    // Test 1: Instance 1 -> Instance 2 broadcast
    const test1Promise = new Promise<{ content: string; senderId: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(new Error("Timeout waiting for message from Instance 1")),
          5000,
        );
        clientOnServer2.once("message:receive", (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        });
      },
    );

    console.log("Client 1 (Instance 1) sending message...");
    clientOnServer1.emit("message:send", {
      channel: TEST_CHANNEL,
      content: "Hello from Instance 1 via Redis Adapter!",
    });

    const receivedOnInstance2 = await test1Promise;
    console.log(
      "SUCCESS: Client 2 (Instance 2) received:",
      receivedOnInstance2.content,
    );

    // Test 2: Instance 2 -> Instance 1 broadcast
    const test2Promise = new Promise<{ content: string; senderId: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(new Error("Timeout waiting for message from Instance 2")),
          5000,
        );
        clientOnServer1.once("message:receive", (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        });
      },
    );

    console.log("Client 2 (Instance 2) sending reply...");
    clientOnServer2.emit("message:send", {
      channel: TEST_CHANNEL,
      content:
        "Reply from Instance 2 via Redis Adapter received loud and clear!",
    });

    const receivedOnInstance1 = await test2Promise;
    console.log(
      "SUCCESS: Client 1 (Instance 1) received:",
      receivedOnInstance1.content,
    );

    console.log("\n=======================================================");
    console.log(">>> MULTI-INSTANCE REDIS ADAPTER VERIFICATION PASSED <<<");
    console.log("=======================================================\n");
  } finally {
    clientOnServer1.disconnect();
    clientOnServer2.disconnect();
  }
}

verifyMultiInstance().catch((err) => {
  console.error("Multi-instance verification failed:", err);
  process.exit(1);
});
