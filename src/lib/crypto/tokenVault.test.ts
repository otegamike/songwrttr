import { afterEach, describe, expect, it } from "vitest";
import { __resetEnvForTests } from "@/lib/config/env";
import {
  decryptToken,
  encryptToken,
  TokenVaultError,
} from "./tokenVault";

const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  __resetEnvForTests();
});

describe("tokenVault", () => {
  it("round-trips a token without storing plaintext", () => {
    const plaintext = "1//refresh-token-value";
    const encrypted = encryptToken(plaintext);

    expect(decryptToken(encrypted)).toBe(plaintext);
    expect(encrypted.ciphertext).not.toContain("refresh-token-value");
    expect(encrypted.iv).not.toBe(encrypted.tag);
    expect(encrypted.keyVersion).toBe(1);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptToken("secret");
    const bytes = Buffer.from(encrypted.ciphertext, "base64");
    bytes[0] ^= 0xff;

    expect(() =>
      decryptToken({
        ...encrypted,
        ciphertext: bytes.toString("base64"),
      }),
    ).toThrow(TokenVaultError);
  });

  it("rejects a different key", () => {
    const encrypted = encryptToken("secret");

    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    __resetEnvForTests();

    expect(() => decryptToken(encrypted)).toThrow(TokenVaultError);
  });

  it("rejects an unsupported key version", () => {
    const encrypted = encryptToken("secret");

    expect(() =>
      decryptToken({ ...encrypted, keyVersion: 99 }),
    ).toThrow(TokenVaultError);
  });
});
