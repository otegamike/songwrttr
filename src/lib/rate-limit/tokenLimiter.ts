import "server-only";
import { ApiError } from "@/lib/api/errors";
import { RateLimit } from "@/models/RateLimit";

const WINDOW_MS = 60_000;
const LIMIT = 120;

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function enforceTokenRateLimit(
  tokenId: string,
  now = Date.now(),
): Promise<void> {
  const windowStart = new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS);
  const expiresAt = new Date(windowStart.getTime() + WINDOW_MS);

  let doc;

  try {
    doc = await RateLimit.findOneAndUpdate(
      { key: tokenId, windowStart },
      {
        $inc: { count: 1 },
        $setOnInsert: { key: tokenId, windowStart, expiresAt },
      },
      { upsert: true, new: true },
    ).lean();
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;

    doc = await RateLimit.findOneAndUpdate(
      { key: tokenId, windowStart },
      { $inc: { count: 1 } },
      { new: true },
    ).lean();
  }

  if ((doc?.count ?? 1) > LIMIT) {
    const retryAfter = Math.max(
      1,
      Math.ceil((expiresAt.getTime() - now) / 1000),
    );

    throw new ApiError(
      "RATE_LIMITED",
      "Too many requests",
      undefined,
      { "Retry-After": String(retryAfter) },
    );
  }
}
