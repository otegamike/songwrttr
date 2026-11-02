import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { getEnv } from "@/lib/config/env";

export const CURRENT_KEY_VERSION = 1;

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface EncryptedToken {
  iv: string;
  tag: string;
  ciphertext: string;
  keyVersion: number;
}

export class TokenVaultError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TokenVaultError";
  }
}

function currentKey(): Buffer {
  const key = Buffer.from(getEnv().TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== KEY_BYTES) {
    throw new TokenVaultError(
      "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes",
    );
  }
  return key;
}

export function encryptToken(plaintext: string): EncryptedToken {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, currentKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptToken(record: EncryptedToken): string {
  if (record.keyVersion !== CURRENT_KEY_VERSION) {
    throw new TokenVaultError(
      `Unsupported token key version: ${record.keyVersion}`,
    );
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      currentKey(),
      Buffer.from(record.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new TokenVaultError("Failed to decrypt stored token", {
      cause: error,
    });
  }
}
