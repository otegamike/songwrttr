import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api/errors";
import { ALL_SCOPES, type Scope } from "@/lib/auth/scopes";
import {
  generateToken,
  hashToken,
  tokenPrefix,
} from "@/lib/auth/tokens";
import { ApiToken } from "@/models/ApiToken";
import type { TokenSummary } from "@/types/tokens";

const MAX_ACTIVE_TOKENS = 20;
const DEFAULT_EXPIRY_DAYS = 30;
const ALLOWED_EXPIRY_DAYS = new Set([1, 7, 30, 90]);
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateTokenInput {
  name: string;
  scopes: Scope[];
  expiresInDays?: number | null;
}

interface TokenLike {
  _id: Types.ObjectId;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

function toTokenSummary(doc: TokenLike): TokenSummary {
  return {
    id: String(doc._id),
    name: doc.name,
    prefix: doc.prefix,
    scopes: doc.scopes as Scope[],
    createdAt: doc.createdAt.toISOString(),
    lastUsedAt: doc.lastUsedAt?.toISOString() ?? null,
    expiresAt: doc.expiresAt?.toISOString() ?? null,
    revokedAt: doc.revokedAt?.toISOString() ?? null,
  };
}

function validateScopes(scopes: Scope[]): Scope[] {
  const unique = [...new Set(scopes)];

  if (unique.length === 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "At least one scope is required",
    );
  }

  for (const scope of unique) {
    if (!ALL_SCOPES.includes(scope)) {
      throw new ApiError("VALIDATION_ERROR", `Unknown scope: ${scope}`);
    }
  }

  return unique;
}

function expiryDate(expiresInDays: number | null | undefined): Date | null {
  if (expiresInDays === null) return null;

  const days = expiresInDays ?? DEFAULT_EXPIRY_DAYS;
  if (!ALLOWED_EXPIRY_DAYS.has(days)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Expiry must be 1, 7, 30, 90 days, or never",
    );
  }

  return new Date(Date.now() + days * DAY_MS);
}

export async function createToken(
  userId: string,
  input: CreateTokenInput,
): Promise<{ token: string; apiToken: TokenSummary }> {
  const name = input.name.trim();
  if (!name || name.length > 100) {
    throw new ApiError("VALIDATION_ERROR", "Token name is invalid");
  }

  const scopes = validateScopes(input.scopes);
  const expiresAt = expiryDate(input.expiresInDays);

  const active = await ApiToken.countDocuments({
    userId,
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });

  if (active >= MAX_ACTIVE_TOKENS) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `You can have at most ${MAX_ACTIVE_TOKENS} active tokens`,
    );
  }

  const token = generateToken();

  const doc = await ApiToken.create({
    userId,
    name,
    tokenHash: hashToken(token),
    prefix: tokenPrefix(token),
    scopes,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
  });

  return {
    token,
    apiToken: toTokenSummary(doc.toObject() as unknown as TokenLike),
  };
}

export async function listTokens(userId: string): Promise<TokenSummary[]> {
  const docs = (await ApiToken.find({ userId })
    .sort({ createdAt: -1 })
    .lean()) as unknown as TokenLike[];

  return docs.map(toTokenSummary);
}

export async function revokeToken(
  userId: string,
  id: string,
): Promise<TokenSummary> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError("NOT_FOUND", "Token not found");
  }

  const doc = await ApiToken.findOneAndUpdate(
    { _id: id, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  ).lean();

  if (!doc) {
    throw new ApiError("NOT_FOUND", "Token not found");
  }

  return toTokenSummary(doc as unknown as TokenLike);
}
