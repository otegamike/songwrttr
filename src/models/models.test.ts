import { describe, expect, it } from "vitest";
import { AccessRequest } from "./AccessRequest";
import { AllowedEmail } from "./AllowedEmail";
import { ApiToken } from "./ApiToken";
import { AuditLog } from "./AuditLog";
import { RateLimit } from "./RateLimit";
import { Song } from "./Song";
import { Take } from "./Take";
import { UploadSession } from "./UploadSession";
import { User } from "./User";

function hasIndex(
  model: { schema: { indexes: () => [Record<string, unknown>, Record<string, unknown>][] } },
  fields: Record<string, unknown>,
): boolean {
  return model.schema
    .indexes()
    .some(([indexFields]) => JSON.stringify(indexFields) === JSON.stringify(fields));
}

describe("User model", () => {
  it("normalizes email and enforces uniqueness", () => {
    expect(User.schema.path("email").options.lowercase).toBe(true);
    expect(hasIndex(User, { email: 1 })).toBe(true);
  });

  it("stores an encrypted refresh token subdocument", () => {
    const tokenPath = User.schema.path("encryptedRefreshToken");
    expect(tokenPath).toBeDefined();
    expect(User.schema.path("driveReconnectRequired").options.default).toBe(
      false,
    );
  });
});

describe("AllowedEmail model", () => {
  it("enforces a unique lowercase email", () => {
    expect(AllowedEmail.schema.path("email").options.lowercase).toBe(true);
    expect(hasIndex(AllowedEmail, { email: 1 })).toBe(true);
    expect(AllowedEmail.schema.path("status").options.enum).toEqual([
      "active",
      "revoked",
    ]);
  });
});

describe("AccessRequest model", () => {
  it("tracks status and created date", () => {
    expect(AccessRequest.schema.path("status").options.enum).toEqual([
      "new",
      "approved",
      "dismissed",
    ]);
    expect(hasIndex(AccessRequest, { status: 1, createdAt: -1 })).toBe(true);
  });
});

describe("Song model", () => {
  it("scopes songs to a user and paginates by updated date", () => {
    expect(hasIndex(Song, { userId: 1, updatedAt: -1 })).toBe(true);
    expect(Song.schema.path("title").options.maxlength).toBe(200);
  });

  it("enforces one import key per user", () => {
    const index = Song.schema.indexes().find(([fields]) => {
      return JSON.stringify(fields) === JSON.stringify({ userId: 1, importKey: 1 });
    });

    expect(index?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { importKey: { $type: "string" } },
    });
  });

  it("indexes instrumental Drive ids for ownership lookup", () => {
    expect(hasIndex(Song, { "instrumental.driveFileId": 1 })).toBe(true);
  });
});

describe("Take model", () => {
  it("orders takes by song and creation date", () => {
    expect(hasIndex(Take, { songId: 1, createdAt: -1 })).toBe(true);
    expect(hasIndex(Take, { driveFileId: 1 })).toBe(true);
    expect(Take.schema.path("durationMs").options.min).toBe(0);
  });
});

describe("UploadSession model", () => {
  it("expires sessions through a TTL index", () => {
    const index = UploadSession.schema.indexes().find(([fields]) => {
      return JSON.stringify(fields) === JSON.stringify({ expiresAt: 1 });
    });

    expect(index?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });

  it("scopes sessions to a user, song and kind", () => {
    expect(hasIndex(UploadSession, { userId: 1, songId: 1, kind: 1 })).toBe(
      true,
    );
  });
});

describe("ApiToken model", () => {
  it("stores only a unique token hash", () => {
    const index = ApiToken.schema.indexes().find(([fields]) => {
      return JSON.stringify(fields) === JSON.stringify({ tokenHash: 1 });
    });

    expect(index?.[1]).toMatchObject({ unique: true });
  });

  it("restricts scopes to the fixed set", () => {
    expect(ApiToken.schema.path("scopes").options.enum).toEqual([
      "songs:read",
      "songs:write",
      "media:write",
      "takes:read",
      "songs:delete",
    ]);
  });
});

describe("RateLimit model", () => {
  it("uses a unique fixed window and a TTL", () => {
    expect(hasIndex(RateLimit, { key: 1, windowStart: 1 })).toBe(true);

    const ttl = RateLimit.schema.indexes().find(([fields]) => {
      return JSON.stringify(fields) === JSON.stringify({ expiresAt: 1 });
    });
    expect(ttl?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });
});

describe("AuditLog model", () => {
  it("indexes audit entries by user and time", () => {
    expect(hasIndex(AuditLog, { userId: 1, at: -1 })).toBe(true);
  });
});
