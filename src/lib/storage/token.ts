import "server-only";
import { GOOGLE_REVOKE_ENDPOINT, GOOGLE_TOKEN_ENDPOINT } from "@/lib/config/constants";
import {
  decryptToken,
  TokenVaultError,
  type EncryptedToken,
} from "@/lib/crypto/tokenVault";
import { StorageError } from "./errors";
import type { FetchLike } from "./http";

export interface UserTokenRecord {
  encryptedRefreshToken: EncryptedToken | null;
  driveReconnectRequired: boolean;
}

export interface UserTokenStore {
  get(userId: string): Promise<UserTokenRecord | null>;
  markReconnectRequired(userId: string): Promise<void>;
}

export interface GoogleTokenServiceOptions {
  store: UserTokenStore;
  fetchImpl?: FetchLike;
  now?: () => number;
  clientId?: string;
  clientSecret?: string;
}

export interface GoogleTokenService {
  getAccessToken(userId: string): Promise<string>;
  revokeAccess(userId: string): Promise<void>;
  clearCache(): void;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAt: number;
}

const CACHE_SAFETY_MS = 60_000;

export function createGoogleTokenService(
  options: GoogleTokenServiceOptions,
): GoogleTokenService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret =
    options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  const cache = new Map<string, CachedAccessToken>();

  async function markReconnect(userId: string): Promise<void> {
    await options.store.markReconnectRequired(userId);
  }

  async function getAccessToken(userId: string): Promise<string> {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now() + CACHE_SAFETY_MS) {
      return cached.accessToken;
    }

    const record = await options.store.get(userId);
    if (
      !record ||
      record.driveReconnectRequired ||
      !record.encryptedRefreshToken
    ) {
      throw new StorageError(
        "DRIVE_RECONNECT_REQUIRED",
        "Google Drive reconnect required",
      );
    }

    let refreshToken: string;
    try {
      refreshToken = decryptToken(record.encryptedRefreshToken);
    } catch (error) {
      if (error instanceof TokenVaultError) {
        await markReconnect(userId);
        throw new StorageError(
          "DRIVE_RECONNECT_REQUIRED",
          "Stored Google credentials are unreadable; reconnect required",
          { cause: error },
        );
      }
      throw error;
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (text.includes("invalid_grant")) {
        await markReconnect(userId);
        throw new StorageError(
          "DRIVE_RECONNECT_REQUIRED",
          "Google Drive access was revoked; reconnect required",
        );
      }
      throw new StorageError(
        "STORAGE_UNAVAILABLE",
        "Could not refresh Google Drive access",
      );
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!data.access_token) {
      throw new StorageError(
        "STORAGE_UNAVAILABLE",
        "Google token response was missing an access token",
      );
    }

    const expiresIn =
      typeof data.expires_in === "number" ? data.expires_in : 3600;

    cache.set(userId, {
      accessToken: data.access_token,
      expiresAt: now() + expiresIn * 1000,
    });

    return data.access_token;
  }

  async function revokeAccess(userId: string): Promise<void> {
    const record = await options.store.get(userId);
    if (!record?.encryptedRefreshToken) { cache.delete(userId); return; }
    let refreshToken: string;
    try { refreshToken = decryptToken(record.encryptedRefreshToken); }
    catch (error) { throw new StorageError("DRIVE_RECONNECT_REQUIRED", "Stored Google credentials could not be decrypted", { cause: error }); }
    const response = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    });
    if (!response.ok && response.status !== 400) throw new StorageError("STORAGE_UNAVAILABLE", "Google token revocation failed");
    cache.delete(userId);
  }

  return {
    getAccessToken,
    revokeAccess,
    clearCache: () => cache.clear(),
  };
}
