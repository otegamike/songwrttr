import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/guards";
import { createToken, listTokens } from "@/lib/services/tokens";
import { GET, POST } from "./route";

vi.mock("@/lib/auth/guards", () => ({
  requireSessionUser: vi.fn(),
}));

vi.mock("@/lib/services/tokens", () => ({
  listTokens: vi.fn(),
  createToken: vi.fn(),
}));

const mockedRequire = vi.mocked(requireSessionUser);
const mockedList = vi.mocked(listTokens);
const mockedCreate = vi.mocked(createToken);

const session = {
  userId: "user-1",
  email: "user@example.com",
  via: "session" as const,
  scopes: [
    "songs:read",
    "songs:write",
    "media:write",
    "takes:read",
    "songs:delete",
  ] as const,
};

const context = { params: Promise.resolve({}) };

function request(method: string, body?: unknown): Request {
  return new Request("http://localhost:3000/api/tokens", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("token collection route", () => {
  it("lists tokens for the session user", async () => {
    mockedRequire.mockResolvedValue({ ...session, scopes: [...session.scopes] });
    mockedList.mockResolvedValue([]);

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith("user-1");
  });

  it("creates a token and returns the raw value once", async () => {
    mockedRequire.mockResolvedValue({ ...session, scopes: [...session.scopes] });
    mockedCreate.mockResolvedValue({
      token: "sp_abc",
      apiToken: {
        id: "token-1",
        name: "Agent",
        prefix: "sp_abcd",
        scopes: ["songs:read"],
        createdAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
      },
    });

    const response = await POST(
      request("POST", {
        name: "Agent",
        scopes: ["songs:read"],
        expiresInDays: null,
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ token: "sp_abc" });
  });

  it("rejects unknown scopes before calling the service", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequire.mockResolvedValue({ ...session, scopes: [...session.scopes] });

    const response = await POST(
      request("POST", { name: "Agent", scopes: ["songs:destroy"] }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("rejects bearer credentials", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequire.mockRejectedValue(
      new ApiError("UNAUTHENTICATED", "Authentication required"),
    );

    const response = await POST(
      request("POST", { name: "Agent", scopes: ["songs:read"] }),
      context,
    );

    expect(response.status).toBe(401);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
