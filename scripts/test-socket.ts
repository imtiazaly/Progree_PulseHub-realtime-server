import { io } from "socket.io-client";

const serverUrl = "http://127.0.0.1:3000";
const channel = "pulsehub-test";

const sender = io(serverUrl);
const receiver = io(serverUrl);

async function joinChannel(socket: typeof sender) {
  return new Promise<void>((resolve, reject) => {
    socket.emit(
      "channel:join",
      { channel },
      (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          reject(new Error(response.error ?? "Channel join failed"));
          return;
        }

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

    await Promise.all([joinChannel(sender), joinChannel(receiver)]);
    console.log("Both clients joined the channel.");

    const receivedMessage = new Promise<unknown>((resolve, reject) => {
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
      { channel, content: "PulseHub test message" },
      (response: { success: boolean; error?: string }) => {
        console.log("Send acknowledgement:", response);
      },
    );

    console.log("Received message:", await receivedMessage);
  } finally {
    sender.disconnect();
    receiver.disconnect();
  }
}

testMessaging().catch((error: unknown) => {
  console.error("Messaging test failed:", error);
  testMessaging().catch(console.error);
});
