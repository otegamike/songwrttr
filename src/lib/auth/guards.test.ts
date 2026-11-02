import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerSession } from "next-auth";
import { resolveBearerAuth } from "@/lib/auth/bearer";
import { enforceTokenRateLimit } from "@/lib/rate-limit/tokenLimiter";
import { requireSessionUser, requireUser } from "./guards";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth/options", () => ({
  authOptions: {},
}));
vi.mock("@/lib/db/connect", () => ({ connectDb: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/auth/bearer", () => ({
  resolveBearerAuth: vi.fn(),
}));

vi.mock("@/lib/rate-limit/tokenLimiter", () => ({
  enforceTokenRateLimit: vi.fn(),
}));

const mockedGetSession = vi.mocked(getServerSession);
const mockedResolveBearer = vi.mocked(resolveBearerAuth);
const mockedRateLimit = vi.mocked(enforceTokenRateLimit);

function request(method = "GET", origin?: string): Request {
  return new Request("http://localhost:3000/api/songs", {
    method,
    headers: origin ? { Origin: origin } : undefined,
  });
}

const bearerContext = {
  userId: "user-1",
  email: "",
  via: "bearer" as const,
  tokenId: "token-1",
  scopes: ["songs:read"] as const,
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("requireUser with bearer tokens", () => {
  it("enforces scopes and rate limits", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedResolveBearer.mockResolvedValue({
      ...bearerContext,
      scopes: [...bearerContext.scopes],
    });

    const context = await requireUser(request(), { scope: "songs:read" });

    expect(context.via).toBe("bearer");
    expect(mockedRateLimit).toHaveBeenCalledWith("token-1");
  });

  it("rejects a missing scope", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedResolveBearer.mockResolvedValue({
      ...bearerContext,
      scopes: [...bearerContext.scopes],
    });

    await expect(
      requireUser(request(), { scope: "songs:write" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns a uniform unauthenticated error for unknown tokens", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedResolveBearer.mockResolvedValue(null);

    await expect(requireUser(request())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
  });

  it("skips the origin check for bearer mutations", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedResolveBearer.mockResolvedValue({
      ...bearerContext,
      scopes: [...bearerContext.scopes],
    });

    await expect(
      requireUser(request("POST", "https://evil.example"), {
        scope: "songs:read",
      }),
    ).resolves.toBeDefined();
  });
});

describe("requireSessionUser", () => {
  it("rejects requests without a session cookie", async () => {
    mockedGetSession.mockResolvedValue(null);

    await expect(requireSessionUser(request())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("grants full access to a cookie session", async () => {
    mockedGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
      expires: "2099-01-01",
    });

    const context = await requireSessionUser(request());

    expect(context.via).toBe("session");
    expect(context.scopes).toContain("songs:delete");
  });

  it("rejects cross-origin cookie mutations", async () => {
    mockedGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
      expires: "2099-01-01",
    });

    await expect(
      requireSessionUser(request("POST", "https://evil.example")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
