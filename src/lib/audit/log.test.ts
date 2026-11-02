import { afterEach, describe, expect, it, vi } from "vitest";
import { auditBearer } from "./log";
import { AuditLog } from "@/models/AuditLog";

vi.mock("@/models/AuditLog", () => ({
  AuditLog: { create: vi.fn() },
}));

const create = AuditLog.create as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.resetAllMocks();
});

describe("auditBearer", () => {
  it("writes an entry for bearer mutations", async () => {
    create.mockResolvedValue({});

    await auditBearer(
      {
        userId: "user-1",
        email: "",
        via: "bearer",
        tokenId: "token-1",
        scopes: ["songs:write"],
      },
      "song.create",
      "song-1",
    );

    expect(create).toHaveBeenCalledWith({
      userId: "user-1",
      tokenId: "token-1",
      action: "song.create",
      targetId: "song-1",
      at: expect.any(Date),
    });
  });

  it("does nothing for cookie sessions", async () => {
    await auditBearer(
      {
        userId: "user-1",
        email: "user@example.com",
        via: "session",
        scopes: ["songs:write"],
      },
      "song.create",
      "song-1",
    );

    expect(create).not.toHaveBeenCalled();
  });

  it("does not fail the request when auditing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    create.mockRejectedValue(new Error("db down"));

    await expect(
      auditBearer(
        {
          userId: "user-1",
          email: "",
          via: "bearer",
          tokenId: "token-1",
          scopes: ["songs:write"],
        },
        "song.create",
        "song-1",
      ),
    ).resolves.toBeUndefined();
  });
});
