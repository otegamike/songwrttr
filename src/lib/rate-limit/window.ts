import "server-only";
import { ApiError } from "@/lib/api/errors";
import { connectDb } from "@/lib/db/connect";
import { RateLimit } from "@/models/RateLimit";

const WINDOW_MS = 60_000;
function duplicate(error: unknown) { return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000; }

export async function enforceWindowLimit(key: string, limit: number, windowMs = WINDOW_MS, now = Date.now()) {
  await connectDb();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);
  let row;
  try {
    row = await RateLimit.findOneAndUpdate({ key, windowStart }, { $inc: { count: 1 }, $setOnInsert: { key, windowStart, expiresAt } }, { upsert: true, new: true }).lean();
  } catch (error) {
    if (!duplicate(error)) throw error;
    row = await RateLimit.findOneAndUpdate({ key, windowStart }, { $inc: { count: 1 } }, { new: true }).lean();
  }
  if ((row?.count ?? 1) > limit) throw new ApiError("RATE_LIMITED", "Too many requests. Please try again shortly.", undefined, { "Retry-After": String(Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000))) });
}
