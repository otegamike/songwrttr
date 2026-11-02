import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/guards";
import { revokeToken } from "@/lib/services/tokens";
import { DELETE } from "./route";

vi.mock("@/lib/auth/guards", () => ({
  requireSessionUser: vi.fn(),
}));

vi.mock("@/lib/services/tokens", () => ({
  revokeToken: vi.fn(),
}));

const mockedRequire = vi.mocked(requireSessionUser);
const mockedRevoke = vi.mocked(revokeToken);

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

const context = { params: Promise.resolve({ id: "token-1" }) };

function request(): Request {
  return new Request("http://localhost:3000/api/tokens/token-1", {
    method: "DELETE",
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("token item route", () => {
  it("revokes an owned token", async () => {
    mockedRequire.mockResolvedValue({ ...session, scopes: [...session.scopes] });
    mockedRevoke.mockResolvedValue({
      id: "token-1",
      name: "Agent",
      prefix: "sp_abcd",
      scopes: ["songs:read"],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: "2026-01-02T00:00:00.000Z",
    });

    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    expect(mockedRevoke).toHaveBeenCalledWith("user-1", "token-1");
  });

  it("returns 404 for an unknown token", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequire.mockResolvedValue({ ...session, scopes: [...session.scopes] });
    mockedRevoke.mockRejectedValue(new ApiError("NOT_FOUND", "Token not found"));

    const response = await DELETE(request(), context);

    expect(response.status).toBe(404);
  });
});
