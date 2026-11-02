import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { connectDb } from "@/lib/db/connect";
import { ApiToken } from "@/models/ApiToken";
import { generateToken, hashToken } from "./tokens";
import { resolveBearerAuth } from "./bearer";

vi.mock("@/lib/db/connect", () => ({
  connectDb: vi.fn(),
}));

vi.mock("@/models/ApiToken", () => ({
  ApiToken: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

const mockedConnectDb = vi.mocked(connectDb);
const findOne = ApiToken.findOne as unknown as Mock;
const updateOne = ApiToken.updateOne as unknown as Mock;

function queryChain(result: unknown) {
  return {
    lean: vi.fn().mockResolvedValue(result),
  };
}

function makeToken(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    userId: "user-1",
    tokenHash: "hash",
    scopes: ["songs:read"],
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function bearer(token: string): Request {
  return new Request("http://localhost:3000/api/songs", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("resolveBearerAuth", () => {
  it("returns null without an authorization header", async () => {
    expect(
      await resolveBearerAuth(new Request("http://localhost:3000/api/songs")),
    ).toBeNull();
    expect(mockedConnectDb).not.toHaveBeenCalled();
  });

  it("returns null for malformed tokens without hitting the database", async () => {
    expect(await resolveBearerAuth(bearer("not-a-token"))).toBeNull();
    expect(mockedConnectDb).not.toHaveBeenCalled();
  });

  it("resolves a valid token to a bearer context", async () => {
    const token = generateToken();
    findOne.mockReturnValue(queryChain(makeToken()));
    updateOne.mockResolvedValue({ acknowledged: true });

    const context = await resolveBearerAuth(bearer(token));

    expect(findOne).toHaveBeenCalledWith({ tokenHash: hashToken(token) });
    expect(context).toMatchObject({
      userId: "user-1",
      via: "bearer",
      scopes: ["songs:read"],
    });
    expect(updateOne).toHaveBeenCalled();
  });

  it("throttles lastUsedAt updates to once per minute", async () => {
    const token = generateToken();
    findOne.mockReturnValue(
      queryChain(makeToken({ lastUsedAt: new Date(Date.now() - 10_000) })),
    );

    await resolveBearerAuth(bearer(token));

    expect(updateOne).not.toHaveBeenCalled();
  });

  it("refreshes lastUsedAt when it is older than a minute", async () => {
    const token = generateToken();
    findOne.mockReturnValue(
      queryChain(makeToken({ lastUsedAt: new Date(Date.now() - 61_000) })),
    );

    await resolveBearerAuth(bearer(token));

    expect(updateOne).toHaveBeenCalled();
  });

  it.each([
    ["unknown", null],
    ["revoked", makeToken({ revokedAt: new Date() })],
    ["expired", makeToken({ expiresAt: new Date(Date.now() - 1000) })],
  ])("returns null for an %s token", async (_label, doc) => {
    findOne.mockReturnValue(queryChain(doc));
    expect(await resolveBearerAuth(bearer(generateToken()))).toBeNull();
  });
});
