import "dotenv/config";
import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

const serverUrl = `http://${env.HOST}:${env.PORT}`;
const channel = "rate-limit-test";

const token = jwt.sign({}, env.JWT_SECRET, {
  subject: "spammer-user-1",
  algorithm: "HS256",
});

const client = io(serverUrl, { auth: { token } });

async function runTest() {
  await new Promise<void>((resolve) => client.once("connect", resolve));
  await new Promise<void>((resolve) =>
    client.emit("channel:join", { channel }, resolve),
  );

  console.log("Connected and joined channel. Sending 12 rapid messages...");

  let accepted = 0;
  let rejected = 0;

  for (let i = 1; i <= 12; i++) {
    await new Promise<void>((resolve) => {
      client.emit(
        "message:send",
        { channel, content: `Message #${i}` },
        (res: { success: boolean; error?: string }) => {
          if (res.success) {
            accepted++;
          } else if (res.error?.includes("Rate limit exceeded")) {
            rejected++;
          }
          resolve();
        },
      );
    });
  }

  console.log(`Results: ${accepted} accepted, ${rejected} rate-limited.`);

  if (accepted === 10 && rejected === 2) {
    console.log("\n>>> RATE LIMITING INTEGRATION TEST PASSED <<<\n");
  } else {
    console.error("Unexpected rate limit result!");
    process.exit(1);
  }

  client.disconnect();
}

runTest().catch((err) => {
  console.error(err);
  client.disconnect();
  process.exit(1);
});
