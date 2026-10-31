const WINDOW_MS = 10_000;
const MAX_MESSAGES = 10;

const messageWindows = new Map<string, { count: number; resetAt: number }>();

const PRUNE_THRESHOLD = 1000;

function pruneExpired(now: number): void {
  for (const [userId, entry] of messageWindows) {
    if (now >= entry.resetAt) messageWindows.delete(userId);
  }
}

export function isMessageRateLimited(userId: string): boolean {
  const now = Date.now();

  if (messageWindows.size > PRUNE_THRESHOLD) {
    pruneExpired(now);
  }
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
