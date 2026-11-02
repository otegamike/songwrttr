import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { AuthContext } from "@/lib/auth/types";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { addInvite, listInvites, revokeInvite } from "@/lib/services/invites";
import { DELETE, GET, POST } from "./route";

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/services/invites", () => ({
  listInvites: vi.fn(),
  addInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));

const mockedRequireUser = vi.mocked(requireUser);
const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedListInvites = vi.mocked(listInvites);
const mockedAddInvite = vi.mocked(addInvite);
const mockedRevokeInvite = vi.mocked(revokeInvite);

const adminContext: AuthContext = {
  userId: "admin-1",
  email: "admin@example.com",
  via: "session",
  scopes: [
    "songs:read",
    "songs:write",
    "media:write",
    "takes:read",
    "songs:delete",
  ],
};

const context = { params: Promise.resolve({}) };

function request(
  method: string,
  body?: unknown,
): Request {
  return new Request("http://localhost:3000/api/admin/invites", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("admin invites route", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequireUser.mockRejectedValue(
      new ApiError("UNAUTHENTICATED", "Authentication required"),
    );

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(401);
  });

  it("lists invites for an admin", async () => {
    mockedRequireUser.mockResolvedValue(adminContext);
    mockedListInvites.mockResolvedValue({
      invites: [],
      requests: [],
    });

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(200);
    expect(mockedRequireAdmin).toHaveBeenCalledWith(adminContext);
  });

  it("adds an invite and returns 201", async () => {
    mockedRequireUser.mockResolvedValue(adminContext);
    mockedAddInvite.mockResolvedValue({
      email: "friend@example.com",
      note: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });

    const response = await POST(
      request("POST", { email: "friend@example.com" }),
      context,
    );

    expect(response.status).toBe(201);
    expect(mockedAddInvite).toHaveBeenCalledWith(
      "friend@example.com",
      undefined,
    );
  });

  it("rejects an invalid email before calling the service", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequireUser.mockResolvedValue(adminContext);

    const response = await POST(
      request("POST", { email: "not-an-email" }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mockedAddInvite).not.toHaveBeenCalled();
  });

  it("revokes an invite", async () => {
    mockedRequireUser.mockResolvedValue(adminContext);
    mockedRevokeInvite.mockResolvedValue({
      email: "friend@example.com",
      note: null,
      status: "revoked",
      createdAt: new Date().toISOString(),
    });

    const response = await DELETE(
      request("DELETE", { email: "friend@example.com" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mockedRevokeInvite).toHaveBeenCalledWith("friend@example.com");
  });
});
