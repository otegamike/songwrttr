import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { hashToken } from "@/lib/auth/tokens";
import { ApiToken } from "@/models/ApiToken";
import { createToken, listTokens, revokeToken } from "./tokens";

vi.mock("@/models/ApiToken", () => ({
  ApiToken: {
    countDocuments: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

const countDocuments = ApiToken.countDocuments as unknown as Mock;
const create = ApiToken.create as unknown as Mock;
const find = ApiToken.find as unknown as Mock;
const findOneAndUpdate = ApiToken.findOneAndUpdate as unknown as Mock;

function makeToken(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new Types.ObjectId(),
    userId: "user-1",
    name: "Agent",
    tokenHash: "hash",
    prefix: "sp_abcd",
    scopes: ["songs:read"],
    expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    toObject: () => doc,
    ...overrides,
  };
  return doc;
}

function queryChain(result: unknown) {
  const query = {
    sort: vi.fn(),
    lean: vi.fn().mockResolvedValue(result),
  };
  query.sort.mockReturnValue(query);
  return query;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("createToken", () => {
  it("returns the raw token once and stores only its hash", async () => {
    countDocuments.mockResolvedValue(0);
    const doc = makeToken();
    create.mockResolvedValue(doc);

    const result = await createToken("user-1", {
      name: "Agent",
      scopes: ["songs:read", "songs:write"],
    });

    expect(result.token).toMatch(/^sp_/);

    const stored = create.mock.calls[0][0] as Record<string, unknown>;
    expect(stored.prefix).toBe(result.token.slice(0, 8));
    expect(stored.tokenHash).toBe(hashToken(result.token));
    expect(stored).not.toHaveProperty("token");
    expect(JSON.stringify(stored)).not.toContain(result.token);
  });

  it("deduplicates scopes and defaults expiry to 30 days", async () => {
    countDocuments.mockResolvedValue(0);
    create.mockResolvedValue(makeToken());

    const before = Date.now();
    await createToken("user-1", {
      name: "Agent",
      scopes: ["songs:read", "songs:read"],
    });

    const stored = create.mock.calls[0][0] as {
      scopes: string[];
      expiresAt: Date;
    };
    expect(stored.scopes).toEqual(["songs:read"]);
    expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 30 * 24 * 60 * 60 * 1000 - 1000,
    );
  });

  it("allows a never-expiring token only when null is explicit", async () => {
    countDocuments.mockResolvedValue(0);
    create.mockResolvedValue(makeToken({ expiresAt: null }));

    await createToken("user-1", {
      name: "Agent",
      scopes: ["songs:read"],
      expiresInDays: null,
    });

    const stored = create.mock.calls[0][0] as { expiresAt: Date | null };
    expect(stored.expiresAt).toBeNull();
  });

  it("rejects unsupported expiry values", async () => {
    await expect(
      createToken("user-1", {
        name: "Agent",
        scopes: ["songs:read"],
        expiresInDays: 2,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("caps active tokens at 20", async () => {
    countDocuments.mockResolvedValue(20);

    await expect(
      createToken("user-1", {
        name: "Agent",
        scopes: ["songs:read"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an empty scope list", async () => {
    await expect(
      createToken("user-1", { name: "Agent", scopes: [] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("listTokens", () => {
  it("returns display data without hashes", async () => {
    find.mockReturnValue(queryChain([makeToken()]));

    const tokens = await listTokens("user-1");

    expect(tokens[0].prefix).toBe("sp_abcd");
    expect(tokens[0]).not.toHaveProperty("tokenHash");
    expect(find).toHaveBeenCalledWith({ userId: "user-1" });
  });
});

describe("revokeToken", () => {
  it("scopes revocation to the owning user", async () => {
    const doc = makeToken({ revokedAt: new Date() });
    findOneAndUpdate.mockReturnValue(queryChain(doc));

    const token = await revokeToken("user-1", String(doc._id));

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: String(doc._id), userId: "user-1", revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
      { new: true },
    );
    expect(token.revokedAt).not.toBeNull();
  });

  it("returns 404 for an invalid id or another user's token", async () => {
    await expect(
      revokeToken("user-1", "not-an-id"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    findOneAndUpdate.mockReturnValue(queryChain(null));
    await expect(
      revokeToken("user-1", String(new Types.ObjectId())),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
