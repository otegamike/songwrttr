import { describe, expect, it } from "vitest";
import {
  generateToken,
  hashToken,
  isTokenFormat,
  tokenPrefix,
} from "./tokens";

describe("token format", () => {
  it("generates sp_ tokens with 40 base64url characters", () => {
    const token = generateToken();

    expect(token).toMatch(/^sp_[A-Za-z0-9_-]{40}$/);
    expect(isTokenFormat(token)).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(isTokenFormat("sp_short")).toBe(false);
    expect(isTokenFormat("Bearer sp_" + "a".repeat(40))).toBe(false);
    expect(isTokenFormat("sp_" + "a".repeat(41))).toBe(false);
  });

  it("hashes deterministically to a 64 character hex digest", () => {
    const token = generateToken();
    const hash = hashToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("stores the first eight characters as the display prefix", () => {
    const token = generateToken();
    expect(tokenPrefix(token)).toBe(token.slice(0, 8));
  });
});
