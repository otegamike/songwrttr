import "server-only";
import { connectDb } from "@/lib/db/connect";
import { ApiToken } from "@/models/ApiToken";
import { hashToken, isTokenFormat } from "./tokens";
import type { AuthContext } from "./types";
import type { Scope } from "./scopes";

const LAST_USED_THROTTLE_MS = 60_000;

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function resolveBearerAuth(
  request: Request,
): Promise<AuthContext | null> {
  const token = bearerToken(request);
  if (!token || !isTokenFormat(token)) return null;

  await connectDb();

  const doc = await ApiToken.findOne({ tokenHash: hashToken(token) }).lean();
  if (!doc) return null;
  if (doc.revokedAt) return null;
  if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) return null;

  const now = Date.now();
  if (
    !doc.lastUsedAt ||
    now - doc.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
  ) {
    await ApiToken.updateOne(
      { _id: doc._id },
      { $set: { lastUsedAt: new Date(now) } },
    );
  }

  return {
    userId: doc.userId,
    email: "",
    via: "bearer",
    tokenId: String(doc._id),
    scopes: doc.scopes as Scope[],
  };
}
