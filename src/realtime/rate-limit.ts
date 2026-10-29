const WINDOW_MS = 10_000;
const MAX_MESSAGES = 10;

const messageWindows = new Map<string, { count: number; resetAt: number }>();

export function isMessageRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = messageWindows.get(userId);

  if (!window || now >= window.resetAt) {
    messageWindows.set(userId, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return false;
  }

  if (window.count >= MAX_MESSAGES) {
    return true;
  }

  window.count++;
  return false;
}
