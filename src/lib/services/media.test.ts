import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { storage } from "@/lib/storage";
import { StorageError } from "@/lib/storage/errors";
import { Song } from "@/models/Song";
import { Take } from "@/models/Take";
import { UploadSession } from "@/models/UploadSession";
import {
  cleanupSongMedia,
  completeInstrumental,
  completeTake,
  deleteInstrumental,
  deleteTake,
  listTakes,
  renameTake,
  startUpload,
  streamMedia,
} from "./media";

vi.mock("@/lib/storage", () => ({
  storage: {
    ensureSongFolder: vi.fn(),
    createUploadSession: vi.fn(),
    getFileMetadata: vi.fn(),
    streamFile: vi.fn(),
    trashFile: vi.fn(),
    listFolderFiles: vi.fn(),
  },
}));

vi.mock("@/models/Song", () => ({
  Song: { findOne: vi.fn(), find: vi.fn() },
}));

vi.mock("@/models/Take", () => ({
  Take: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    countDocuments: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/models/UploadSession", () => ({
  UploadSession: {
    find: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit/window", () => ({ enforceWindowLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/config/env", () => ({ getEnv: () => ({ MAX_INSTRUMENTAL_MB: 50, MAX_TAKE_MB: 100, MAX_TAKES_PER_SONG: 50, UPLOAD_SESSIONS_PER_MINUTE: 10, MAX_AUDIO_BYTES_PER_USER: 100 }) }));

const mockedStorage = vi.mocked(storage);
const songFindOne = Song.findOne as unknown as Mock;
const songFind = Song.find as unknown as Mock;
const sessionFind = UploadSession.find as unknown as Mock;
const takeFind = Take.find as unknown as Mock;
const takeFindOne = Take.findOne as unknown as Mock;
const takeFindOneAndUpdate = Take.findOneAndUpdate as unknown as Mock;
const takeCount = Take.countDocuments as unknown as Mock;
const takeCreate = Take.create as unknown as Mock;
const takeDeleteOne = Take.deleteOne as unknown as Mock;
const takeDeleteMany = Take.deleteMany as unknown as Mock;
const sessionCreate = UploadSession.create as unknown as Mock;
const sessionFindOne = UploadSession.findOne as unknown as Mock;
const sessionDeleteMany = UploadSession.deleteMany as unknown as Mock;

function queryChain(result: unknown) {
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    lean: vi.fn().mockResolvedValue(result),
  };

  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  return query;
}

function makeSong(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: new Types.ObjectId(),
    title: "Demo",
    titleNormalized: "demo",
    lyricsJson: { type: "doc", content: [] },
    lyricsText: "",
    driveFolderId: "folder-1" as string | null,
    instrumental: null as Record<string, unknown> | null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    save: vi.fn().mockResolvedValue(undefined),
    toObject: () => doc,
    ...overrides,
  };
  return doc;
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    userId: "user-1",
    songId: new Types.ObjectId(),
    kind: "instrumental",
    fileName: "demo.mp3",
    mimeType: "audio/mpeg",
    size: 100,
    folderId: "folder-1",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  };
}

function makeMetadata(overrides: Record<string, unknown> = {}) {
  return {
    id: "drive-1",
    name: "demo.mp3",
    mimeType: "audio/mpeg",
    size: 100,
    md5Checksum: "md5-1",
    parents: ["folder-1"],
    trashed: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

beforeEach(() => {
  songFind.mockReturnValue(queryChain([]));
  takeFind.mockReturnValue(queryChain([]));
  sessionFind.mockReturnValue(queryChain([]));
});

describe("startUpload", () => {
  it("enforces the user's total stored audio cap before creating a Drive session", async () => {
    const song = makeSong(); songFindOne.mockResolvedValue(song);
    songFind.mockReturnValue(queryChain([{ instrumental: { size: 1 } }]));
    takeFind.mockReturnValue(queryChain([])); sessionFind.mockReturnValue(queryChain([]));
    await expect(startUpload("user-1", String(song._id), "instrumental", { fileName: "demo.mp3", mimeType: "audio/mpeg", size: 100 })).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(mockedStorage.createUploadSession).not.toHaveBeenCalled();
  });

  it("rejects an unsupported mime type before touching storage", async () => {
    await expect(
      startUpload("user-1", String(new Types.ObjectId()), "instrumental", {
        fileName: "demo.txt",
        mimeType: "text/plain",
        size: 10,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(songFindOne).not.toHaveBeenCalled();
    expect(mockedStorage.createUploadSession).not.toHaveBeenCalled();
  });

  it("rejects oversized instrumentals", async () => {
    await expect(
      startUpload("user-1", String(new Types.ObjectId()), "instrumental", {
        fileName: "demo.mp3",
        mimeType: "audio/mpeg",
        size: 51 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("creates a Drive session and stores the upload session", async () => {
    const song = makeSong({ driveFolderId: null });
    songFindOne.mockResolvedValue(song);
    mockedStorage.ensureSongFolder.mockResolvedValue("folder-9");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    mockedStorage.createUploadSession.mockResolvedValue({
      uploadUrl: "https://upload.example/session",
      expiresAt,
    });
    sessionCreate.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await startUpload(
      "user-1",
      String(song._id),
      "instrumental",
      { fileName: " demo.mp3 ", mimeType: "AUDIO/MPEG", size: 100 },
      "https://app.example",
    );

    expect(mockedStorage.ensureSongFolder).toHaveBeenCalledWith(
      "user-1",
      String(song._id),
      "Demo",
    );
    expect(mockedStorage.createUploadSession).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        folderId: "folder-9",
        fileName: "demo.mp3",
        mimeType: "audio/mpeg",
        origin: "https://app.example",
      }),
    );
    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        kind: "instrumental",
        folderId: "folder-9",
        expiresAt,
      }),
    );
    expect(result.uploadUrl).toBe("https://upload.example/session");
  });
});

describe("completeInstrumental", () => {
  it("rejects another user's upload session", async () => {
    sessionFindOne.mockResolvedValue(null);

    await expect(
      completeInstrumental("user-2", String(new Types.ObjectId()), {
        uploadId: String(new Types.ObjectId()),
        driveFileId: "drive-1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockedStorage.getFileMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong parent", { parents: ["folder-other"] }],
    ["wrong size", { size: 999 }],
    ["wrong type", { mimeType: "audio/ogg" }],
    ["trashed", { trashed: true }],
    ["missing checksum", { md5Checksum: null }],
  ])("rejects a file with %s", async (_label, overrides) => {
    sessionFindOne.mockResolvedValue(makeSession());
    mockedStorage.getFileMetadata.mockResolvedValue(
      makeMetadata(overrides),
    );

    await expect(
      completeInstrumental("user-1", String(new Types.ObjectId()), {
        uploadId: String(new Types.ObjectId()),
        driveFileId: "drive-1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("saves the new instrumental before trashing the old file", async () => {
    const order: string[] = [];
    const previous = {
      driveFileId: "old-drive",
      fileName: "old.mp3",
      mimeType: "audio/mpeg",
      size: 100,
      md5Checksum: "old-md5",
      uploadedAt: new Date(),
    };
    const song = makeSong({ instrumental: previous });
    song.save.mockImplementation(async () => {
      order.push("save");
    });
    const session = makeSession({ songId: song._id });
    sessionFindOne.mockResolvedValue(session);
    mockedStorage.getFileMetadata.mockResolvedValue(makeMetadata());
    mockedStorage.trashFile.mockImplementation(async () => {
      order.push("trash");
    });
    songFindOne.mockResolvedValue(song);

    const result = await completeInstrumental(
      "user-1",
      String(song._id),
      {
        uploadId: String(session._id),
        driveFileId: "drive-1",
      },
    );

    expect(order).toEqual(["save", "trash"]);
    expect(mockedStorage.trashFile).toHaveBeenCalledWith(
      "user-1",
      "old-drive",
    );
    expect(result.instrumental?.driveFileId).toBe("drive-1");
  });

  it("does not trash the old file when the file id is unchanged", async () => {
    const song = makeSong({
      instrumental: {
        driveFileId: "drive-1",
        fileName: "demo.mp3",
        mimeType: "audio/mpeg",
        size: 100,
        md5Checksum: "md5-1",
        uploadedAt: new Date(),
      },
    });
    const session = makeSession({ songId: song._id });
    sessionFindOne.mockResolvedValue(session);
    mockedStorage.getFileMetadata.mockResolvedValue(makeMetadata());
    songFindOne.mockResolvedValue(song);

    await completeInstrumental("user-1", String(song._id), {
      uploadId: String(session._id),
      driveFileId: "drive-1",
    });

    expect(mockedStorage.trashFile).not.toHaveBeenCalled();
  });
});

describe("deleteInstrumental", () => {
  it("trashes the file before clearing the field", async () => {
    const order: string[] = [];
    const song = makeSong({
      instrumental: {
        driveFileId: "drive-1",
        fileName: "demo.mp3",
        mimeType: "audio/mpeg",
        size: 100,
        md5Checksum: "md5-1",
        uploadedAt: new Date(),
      },
    });
    songFindOne.mockResolvedValue(song);
    mockedStorage.trashFile.mockImplementation(async () => {
      order.push("trash");
    });
    song.save.mockImplementation(async () => {
      order.push("save");
    });

    await deleteInstrumental("user-1", String(song._id));

    expect(order).toEqual(["trash", "save"]);
    expect(song.instrumental).toBeNull();
  });

  it("keeps the field when trashing fails", async () => {
    const song = makeSong({
      instrumental: {
        driveFileId: "drive-1",
        fileName: "demo.mp3",
        mimeType: "audio/mpeg",
        size: 100,
        md5Checksum: "md5-1",
        uploadedAt: new Date(),
      },
    });
    songFindOne.mockResolvedValue(song);
    mockedStorage.trashFile.mockRejectedValue(
      new StorageError("STORAGE_UNAVAILABLE", "boom"),
    );

    await expect(
      deleteInstrumental("user-1", String(song._id)),
    ).rejects.toBeInstanceOf(StorageError);
    expect(song.save).not.toHaveBeenCalled();
  });
});

describe("completeTake", () => {
  it("uses the next take number by default", async () => {
    const session = makeSession({ kind: "take" });
    const song = makeSong();
    sessionFindOne.mockResolvedValue(session);
    mockedStorage.getFileMetadata.mockResolvedValue(makeMetadata());
    songFindOne.mockResolvedValue(song);
    takeCount.mockResolvedValue(2);
    const created = {
      _id: new Types.ObjectId(),
      songId: song._id,
      name: "Take 3",
      driveFileId: "drive-1",
      mimeType: "audio/mpeg",
      size: 100,
      durationMs: 5000,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      toObject: () => created,
    };
    takeCreate.mockResolvedValue(created);

    const result = await completeTake("user-1", String(song._id), {
      uploadId: String(session._id),
      driveFileId: "drive-1",
      durationMs: 5000,
    });

    expect(takeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Take 3",
        durationMs: 5000,
        md5Checksum: "md5-1",
      }),
    );
    expect(result.name).toBe("Take 3");
    expect(result.url).toBe("/api/media/drive-1");
  });
});

describe("takes", () => {
  it("lists takes newest first", async () => {
    const song = makeSong();
    songFindOne.mockResolvedValue(song);
    takeFind.mockReturnValue(
      queryChain([
        {
          _id: new Types.ObjectId(),
          songId: song._id,
          name: "Take 2",
          driveFileId: "drive-2",
          mimeType: "audio/webm",
          size: 10,
          durationMs: 1000,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ]),
    );

    const takes = await listTakes("user-1", String(song._id));

    expect(takeFind).toHaveBeenCalledWith({
      userId: "user-1",
      songId: song._id,
    });
    expect(takes[0].name).toBe("Take 2");
  });

  it("renames an owned take", async () => {
    const takeId = new Types.ObjectId();
    takeFindOneAndUpdate.mockReturnValue(
      queryChain({
        _id: takeId,
        songId: new Types.ObjectId(),
        name: "Hook",
        driveFileId: "drive-1",
        mimeType: "audio/webm",
        size: 10,
        durationMs: 1000,
        createdAt: new Date(),
      }),
    );

    const result = await renameTake("user-1", String(takeId), " Hook ");

    expect(result.name).toBe("Hook");
    expect(takeFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: takeId, userId: "user-1" },
      { $set: { name: "Hook" } },
      { new: true },
    );
  });

  it("trashes the take before deleting the row", async () => {
    const order: string[] = [];
    const take = {
      _id: new Types.ObjectId(),
      userId: "user-1",
      driveFileId: "drive-1",
    };
    takeFindOne.mockResolvedValue(take);
    mockedStorage.trashFile.mockImplementation(async () => {
      order.push("trash");
    });
    takeDeleteOne.mockImplementation(async () => {
      order.push("delete");
    });

    await deleteTake("user-1", String(take._id));

    expect(order).toEqual(["trash", "delete"]);
  });

  it("keeps the take row when trashing fails", async () => {
    const take = {
      _id: new Types.ObjectId(),
      userId: "user-1",
      driveFileId: "drive-1",
    };
    takeFindOne.mockResolvedValue(take);
    mockedStorage.trashFile.mockRejectedValue(
      new StorageError("STORAGE_UNAVAILABLE", "boom"),
    );

    await expect(
      deleteTake("user-1", String(take._id)),
    ).rejects.toBeInstanceOf(StorageError);
    expect(takeDeleteOne).not.toHaveBeenCalled();
  });
});

describe("streamMedia", () => {
  it("returns 404 for a file owned by another user", async () => {
    songFindOne.mockReturnValue(queryChain(null));
    takeFindOne.mockReturnValue(queryChain(null));

    await expect(
      streamMedia("user-1", "someone-elses-file", null, "GET"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockedStorage.streamFile).not.toHaveBeenCalled();
  });

  it("forwards range responses and adds immutable cache headers", async () => {
    songFindOne.mockReturnValue(
      queryChain({ instrumental: { md5Checksum: "abc123" } }),
    );
    const upstreamHeaders = new Headers({
      "Content-Type": "audio/mpeg",
      "Content-Length": "1024",
      "Content-Range": "bytes 0-1023/2048",
      "Accept-Ranges": "bytes",
    });
    mockedStorage.streamFile.mockResolvedValue({
      status: 206,
      body: null,
      headers: upstreamHeaders,
    });

    const response = await streamMedia(
      "user-1",
      "drive-1",
      "bytes=0-1023",
      "GET",
    );

    expect(mockedStorage.streamFile).toHaveBeenCalledWith(
      "user-1",
      "drive-1",
      "bytes=0-1023",
      "GET",
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-1023/2048");
    expect(response.headers.get("etag")).toBe('"abc123"');
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
  });

  it("maps Drive 404 to FILE_MISSING", async () => {
    takeFindOne.mockReturnValue(queryChain(null));
    songFindOne.mockReturnValue(
      queryChain({ instrumental: { md5Checksum: "abc123" } }),
    );
    mockedStorage.streamFile.mockRejectedValue(
      new StorageError("FILE_MISSING", "gone"),
    );

    await expect(
      streamMedia("user-1", "drive-1", null, "HEAD"),
    ).rejects.toMatchObject({ code: "FILE_MISSING" });
  });
});

describe("cleanupSongMedia", () => {
  it("trashes files, empties the folder, then deletes rows", async () => {
    const order: string[] = [];
    const songId = new Types.ObjectId();
    takeFind.mockReturnValue(
      queryChain([
        { driveFileId: "take-1" },
        { driveFileId: "take-2" },
      ]),
    );
    mockedStorage.trashFile.mockImplementation(async (_userId, fileId) => {
      order.push(`trash:${fileId}`);
    });
    mockedStorage.listFolderFiles.mockResolvedValue([]);
    sessionDeleteMany.mockImplementation(async () => {
      order.push("delete:sessions");
    });
    takeDeleteMany.mockImplementation(async () => {
      order.push("delete:takes");
    });

    await cleanupSongMedia({
      _id: String(songId),
      userId: "user-1",
      instrumental: { driveFileId: "inst-1" },
      driveFolderId: "folder-1",
    });

    expect(order).toEqual([
      "trash:inst-1",
      "trash:take-1",
      "trash:take-2",
      "trash:folder-1",
      "delete:sessions",
      "delete:takes",
    ]);
  });

  it("keeps rows when a trash call fails", async () => {
    takeFind.mockReturnValue(queryChain([{ driveFileId: "take-1" }]));
    mockedStorage.trashFile.mockRejectedValue(
      new StorageError("STORAGE_UNAVAILABLE", "boom"),
    );

    await expect(
      cleanupSongMedia({
        _id: String(new Types.ObjectId()),
        userId: "user-1",
        instrumental: null,
        driveFolderId: null,
      }),
    ).rejects.toBeInstanceOf(StorageError);

    expect(takeDeleteMany).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });
});
