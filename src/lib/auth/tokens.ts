import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "sp_";
const TOKEN_PATTERN = /^sp_[A-Za-z0-9_-]{40}$/;

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(30).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenPrefix(token: string): string {
  return token.slice(0, 8);
}

export function isTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
