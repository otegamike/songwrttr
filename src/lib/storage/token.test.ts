import { describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/crypto/tokenVault";
import type { FetchLike } from "./http";
import {
  createGoogleTokenService,
  type UserTokenRecord,
  type UserTokenStore,
} from "./token";

function createStore(record: UserTokenRecord | null) {
  const markReconnectRequired = vi.fn(async () => undefined);
  const store: UserTokenStore = {
    get: vi.fn(async () => record),
    markReconnectRequired,
  };
  return { store, markReconnectRequired };
}

describe("google token service", () => {
  it("revokes the encrypted refresh token and clears its cached access token", async () => {
    const { store } = createStore({ encryptedRefreshToken: encryptToken("refresh-abc"), driveReconnectRequired: false });
    const fetchImpl = vi.fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ access_token: "access-1", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const service = createGoogleTokenService({ store, fetchImpl, now: () => 1_000_000 });
    await service.getAccessToken("user-1");
    await service.revokeAccess("user-1");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://oauth2.googleapis.com/revoke");
    expect(String(fetchImpl.mock.calls[1]?.[1]?.body)).toBe("token=refresh-abc");
  });

  it("exchanges the refresh token and caches the access token", async () => {
    const { store } = createStore({
      encryptedRefreshToken: encryptToken("refresh-abc"),
      driveReconnectRequired: false,
    });

    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      Response.json({ access_token: "access-1", expires_in: 3600 }),
    );

    const service = createGoogleTokenService({
      store,
      fetchImpl,
      now: () => 1_000_000,
      clientId: "client",
      clientSecret: "secret",
    });

    expect(await service.getAccessToken("user-1")).toBe("access-1");
    expect(await service.getAccessToken("user-1")).toBe("access-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain("refresh_token=refresh-abc");
    expect(String(init?.body)).toContain("grant_type=refresh_token");
  });

  it("marks reconnect required on invalid_grant", async () => {
    const { store, markReconnectRequired } = createStore({
      encryptedRefreshToken: encryptToken("refresh-abc"),
      driveReconnectRequired: false,
    });

    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      new Response('{"error":"invalid_grant"}', { status: 400 }),
    );

    const service = createGoogleTokenService({
      store,
      fetchImpl,
      now: () => 1_000_000,
    });

    await expect(service.getAccessToken("user-1")).rejects.toMatchObject({
      code: "DRIVE_RECONNECT_REQUIRED",
    });
    expect(markReconnectRequired).toHaveBeenCalledWith("user-1");
  });

  it("requires reconnect when no refresh token is stored", async () => {
    const { store } = createStore({
      encryptedRefreshToken: null,
      driveReconnectRequired: false,
    });

    const service = createGoogleTokenService({ store });

    await expect(service.getAccessToken("user-1")).rejects.toMatchObject({
      code: "DRIVE_RECONNECT_REQUIRED",
    });
  });

  it("requires reconnect when the user is flagged", async () => {
    const { store } = createStore({
      encryptedRefreshToken: encryptToken("refresh-abc"),
      driveReconnectRequired: true,
    });

    const service = createGoogleTokenService({ store });

    await expect(service.getAccessToken("user-1")).rejects.toMatchObject({
      code: "DRIVE_RECONNECT_REQUIRED",
    });
  });
});
