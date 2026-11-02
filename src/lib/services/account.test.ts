import { afterEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/lib/storage";
import { User } from "@/models/User";
import { Song } from "@/models/Song";
import { Take } from "@/models/Take";
import { ApiToken } from "@/models/ApiToken";
import { UploadSession } from "@/models/UploadSession";
import { AuditLog } from "@/models/AuditLog";
import { RateLimit } from "@/models/RateLimit";
import { deleteAccount } from "./account";

const deletions = { user: vi.fn(), songs: vi.fn(), takes: vi.fn(), tokens: vi.fn(), sessions: vi.fn(), audit: vi.fn(), limits: vi.fn() };
vi.mock("@/lib/db/connect", () => ({ connectDb: vi.fn() }));
vi.mock("@/lib/storage", () => ({ storage: { revokeAccess: vi.fn() } }));
vi.mock("@/models/User", () => ({ User: { findById: vi.fn(), deleteOne: vi.fn() } }));
vi.mock("@/models/Song", () => ({ Song: { deleteMany: vi.fn() } }));
vi.mock("@/models/Take", () => ({ Take: { deleteMany: vi.fn() } }));
vi.mock("@/models/ApiToken", () => ({ ApiToken: { find: vi.fn(), deleteMany: vi.fn() } }));
vi.mock("@/models/UploadSession", () => ({ UploadSession: { deleteMany: vi.fn() } }));
vi.mock("@/models/AuditLog", () => ({ AuditLog: { deleteMany: vi.fn() } }));
vi.mock("@/models/RateLimit", () => ({ RateLimit: { deleteMany: vi.fn() } }));

afterEach(() => vi.resetAllMocks());
describe("deleteAccount", () => {
  it("revokes Google access, removes app records, and never trashes Drive files", async () => {
    vi.mocked(User.findById).mockReturnValue({ select: () => ({ lean: async () => ({ encryptedRefreshToken: { ciphertext: "encrypted" }, driveReconnectRequired: false }) }) } as never);
    vi.mocked(ApiToken.find).mockReturnValue({ select: () => ({ lean: async () => [{ _id: "token-id" }] }) } as never);
    vi.mocked(User.deleteOne).mockImplementation(deletions.user as never);
    vi.mocked(Song.deleteMany).mockImplementation(deletions.songs as never);
    vi.mocked(Take.deleteMany).mockImplementation(deletions.takes as never);
    vi.mocked(ApiToken.deleteMany).mockImplementation(deletions.tokens as never);
    vi.mocked(UploadSession.deleteMany).mockImplementation(deletions.sessions as never);
    vi.mocked(AuditLog.deleteMany).mockImplementation(deletions.audit as never);
    vi.mocked(RateLimit.deleteMany).mockImplementation(deletions.limits as never);

    await deleteAccount("user-1");
    expect(storage.revokeAccess).toHaveBeenCalledWith("user-1");
    expect(deletions.songs).toHaveBeenCalledWith({ userId: "user-1" });
    expect(deletions.takes).toHaveBeenCalledWith({ userId: "user-1" });
    expect(deletions.limits).toHaveBeenCalledWith({ key: { $in: ["token-id", "song-create:user-1", "upload-session:user-1"] } });
    expect(storage).not.toHaveProperty("trashFile");
  });
});
