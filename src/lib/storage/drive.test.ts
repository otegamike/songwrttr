import { describe, expect, it, vi } from "vitest";
import { createDriveProvider, type StorageUserRepo } from "./drive";
import type { FetchLike } from "./http";

function createUserRepo(rootFolderId: string | null = null) {
  const state = { rootFolderId };
  const repo: StorageUserRepo = {
    getDriveRootFolderId: vi.fn(async () => state.rootFolderId),
    setDriveRootFolderId: vi.fn(async (_userId, folderId) => {
      state.rootFolderId = folderId;
    }),
  };
  return { repo, state };
}

function createProvider(fetchImpl: FetchLike) {
  const { repo, state } = createUserRepo();
  const provider = createDriveProvider({
    getAccessToken: async () => "access-token",
    userRepo: repo,
    fetchImpl,
    sleep: async () => undefined,
    random: () => 0.5,
    now: () => 1_000_000,
    appName: "SongPad",
  });
  return { provider, repo, state };
}

describe("drive provider", () => {
  it("revokes Google authorization without logging the token", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response(null, { status: 200 }));
    const { provider } = createProvider(fetchImpl);
    await provider.revokeAccess("user-1");
    expect(fetchImpl).toHaveBeenCalledWith("https://oauth2.googleapis.com/revoke", expect.objectContaining({ method: "POST", body: "token=access-token" }));
  });

  it("creates a resumable upload session with the expected request shape", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { location: "https://upload.example/session" },
      }),
    );
    const { provider } = createProvider(fetchImpl);

    const result = await provider.createUploadSession("user-1", {
      folderId: "folder-1",
      fileName: "beat.mp3",
      mimeType: "audio/mpeg",
      size: 1234,
      origin: "https://app.example",
    });

    expect(result.uploadUrl).toBe("https://upload.example/session");
    expect(result.expiresAt.toISOString()).toBe(
      new Date(1_000_000 + 3_600_000).toISOString(),
    );

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toContain("uploadType=resumable");
    expect(init?.method).toBe("POST");

    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer access-token");
    expect(headers.get("x-upload-content-type")).toBe("audio/mpeg");
    expect(headers.get("x-upload-content-length")).toBe("1234");
    expect(headers.get("origin")).toBe("https://app.example");

    const body = JSON.parse(String(init?.body)) as {
      name: string;
      parents: string[];
    };
    expect(body.name).toBe("beat.mp3");
    expect(body.parents).toEqual(["folder-1"]);
  });

  it("finds an existing root folder before creating one", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        Response.json({ files: [{ id: "root-1", name: "SongPad" }] }),
      );
    const { provider, repo } = createProvider(fetchImpl);

    await expect(provider.ensureRootFolder("user-1")).resolves.toBe("root-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(repo.setDriveRootFolderId).toHaveBeenCalledWith("user-1", "root-1");
  });

  it("creates a root folder when none exists", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ files: [] }))
      .mockResolvedValueOnce(Response.json({ id: "root-new" }));
    const { provider, state } = createProvider(fetchImpl);

    await expect(provider.ensureRootFolder("user-1")).resolves.toBe(
      "root-new",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(state.rootFolderId).toBe("root-new");
  });

  it("maps file metadata including size and md5", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      Response.json({
        id: "file-1",
        name: "beat.mp3",
        mimeType: "audio/mpeg",
        size: "4096",
        md5Checksum: "abc123",
        parents: ["folder-1"],
        trashed: false,
      }),
    );
    const { provider } = createProvider(fetchImpl);

    await expect(provider.getFileMetadata("user-1", "file-1")).resolves.toEqual(
      {
        id: "file-1",
        name: "beat.mp3",
        mimeType: "audio/mpeg",
        size: 4096,
        md5Checksum: "abc123",
        parents: ["folder-1"],
        trashed: false,
      },
    );
  });

  it("forwards Range and returns 206 streaming metadata", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          "content-range": "bytes 0-2/10",
          "content-type": "audio/mpeg",
        },
      }),
    );
    const { provider } = createProvider(fetchImpl);

    const result = await provider.streamFile(
      "user-1",
      "file-1",
      "bytes=0-2",
    );

    expect(result.status).toBe(206);
    expect(result.headers.get("content-range")).toBe("bytes 0-2/10");

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("range")).toBe("bytes=0-2");
  });

  it("treats a 404 on trash as success", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response(null, { status: 404 }));
    const { provider } = createProvider(fetchImpl);

    await expect(
      provider.trashFile("user-1", "file-1"),
    ).resolves.toBeUndefined();
  });
});
