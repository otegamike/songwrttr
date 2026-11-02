import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SongPadClient } from "./client.js";
import { inspectAudioFile } from "./audio.js";
import { buildToolHandlers } from "./tools.js";

function song(overrides: Record<string, unknown> = {}) {
  return {
    id: "song-1",
    title: "Demo",
    updatedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    hasInstrumental: false,
    instrumentalFileName: null,
    instrumental: null,
    lyricsText: "",
    lyricsJson: { type: "doc", content: [] },
    ...overrides,
  };
}

function makeClient() {
  return {
    searchSongs: vi.fn(),
    getSong: vi.fn(),
    createSong: vi.fn(),
    updateLyrics: vi.fn(),
    startInstrumentalUpload: vi.fn(),
    completeInstrumental: vi.fn(),
    listTakes: vi.fn(),
    uploadFile: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("search and read tools", () => {
  it("returns compact search results", async () => {
    const client = makeClient();
    client.searchSongs.mockResolvedValue({
      songs: [
        {
          id: "song-1",
          title: "Love Song",
          hasInstrumental: true,
          matchedIn: ["title"],
          snippet: "ignored",
        },
      ],
      nextCursor: null,
    });
    const handlers = buildToolHandlers(
      client as unknown as SongPadClient,
      { maxInstrumentalMb: 50 },
    );

    const result = await handlers.searchSongs({ query: "love" });

    expect(result.songs[0]).toEqual({
      id: "song-1",
      title: "Love Song",
      hasInstrumental: true,
      matchedIn: ["title"],
    });
  });

  it("includes take count in get_song", async () => {
    const client = makeClient();
    client.getSong.mockResolvedValue(song({ lyricsText: "hello" }));
    client.listTakes.mockResolvedValue([{ id: "take-1" }, { id: "take-2" }]);
    const handlers = buildToolHandlers(
      client as unknown as SongPadClient,
      { maxInstrumentalMb: 50 },
    );

    const result = await handlers.getSong({ songId: "song-1" });

    expect(result.lyricsText).toBe("hello");
    expect(result.takeCount).toBe(2);
  });
});

describe("upload_instrumental", () => {
  it("rejects a missing file before calling the API", async () => {
    const client = makeClient();
    const handlers = buildToolHandlers(
      client as unknown as SongPadClient,
      { maxInstrumentalMb: 50 },
    );

    await expect(
      handlers.uploadInstrumental({
        songId: "song-1",
        filePath: path.join(tmpdir(), "does-not-exist.mp3"),
      }),
    ).rejects.toThrow("File not found");
    expect(client.startInstrumentalUpload).not.toHaveBeenCalled();
  });

  it("rejects oversize files before upload", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "songpad-mcp-"));
    const filePath = path.join(directory, "demo.mp3");
    await writeFile(filePath, Buffer.from("fake-mp3"));

    try {
      const client = makeClient();
      const handlers = buildToolHandlers(
        client as unknown as SongPadClient,
        { maxInstrumentalMb: 0 },
      );

      await expect(
        handlers.uploadInstrumental({ songId: "song-1", filePath }),
      ).rejects.toThrow("limit is 0 MB");
      expect(client.startInstrumentalUpload).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uploads through session, PUT and complete", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "songpad-mcp-"));
    const filePath = path.join(directory, "demo.mp3");
    await writeFile(filePath, Buffer.from("fake-mp3"));

    try {
      const client = makeClient();
      client.startInstrumentalUpload.mockResolvedValue({
        uploadId: "upload-1",
        uploadUrl: "https://upload.example/session",
        expiresAt: "2026-01-01T01:00:00.000Z",
      });
      client.uploadFile.mockResolvedValue("drive-1");
      client.completeInstrumental.mockResolvedValue(
        song({
          hasInstrumental: true,
          instrumental: { driveFileId: "drive-1", fileName: "demo.mp3" },
        }),
      );
      const handlers = buildToolHandlers(
        client as unknown as SongPadClient,
        { maxInstrumentalMb: 50 },
      );

      const result = await handlers.uploadInstrumental({
        songId: "song-1",
        filePath,
      });

      expect(client.startInstrumentalUpload).toHaveBeenCalledWith("song-1", {
        fileName: "demo.mp3",
        mimeType: "audio/mpeg",
        size: 8,
      });
      expect(client.completeInstrumental).toHaveBeenCalledWith("song-1", {
        uploadId: "upload-1",
        driveFileId: "drive-1",
      });
      expect(result.hasInstrumental).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("import_song", () => {
  it("skips an already-imported song with an instrumental", async () => {
    const client = makeClient();
    client.createSong.mockResolvedValue({
      created: false,
      song: song({
        hasInstrumental: true,
        instrumental: { driveFileId: "drive-1" },
      }),
    });
    const handlers = buildToolHandlers(
      client as unknown as SongPadClient,
      { maxInstrumentalMb: 50 },
    );

    const result = await handlers.importSong({
      title: "Demo",
      lyrics: "hello",
      instrumentalPath: "C:/music/demo.mp3",
      importKey: "demo",
    });

    expect(result).toMatchObject({
      status: "skipped",
      songId: "song-1",
      created: false,
    });
    expect(client.startInstrumentalUpload).not.toHaveBeenCalled();
  });

  it("returns partial success when upload fails after creation", async () => {
    const client = makeClient();
    client.createSong.mockResolvedValue({ created: true, song: song() });
    client.startInstrumentalUpload.mockResolvedValue({
      uploadId: "upload-1",
      uploadUrl: "https://upload.example/session",
      expiresAt: "2026-01-01T01:00:00.000Z",
    });
    client.uploadFile.mockRejectedValue(new Error("Drive upload failed"));
    const handlers = buildToolHandlers(
      client as unknown as SongPadClient,
      { maxInstrumentalMb: 50 },
    );

    const directory = await mkdtemp(path.join(tmpdir(), "songpad-mcp-"));
    const filePath = path.join(directory, "demo.mp3");
    await writeFile(filePath, Buffer.from("fake-mp3"));

    try {
      const result = await handlers.importSong({
        title: "Demo",
        lyrics: "hello",
        instrumentalPath: filePath,
        importKey: "demo",
      });

      expect(result).toMatchObject({
        status: "partial",
        songId: "song-1",
        failedStep: "upload_instrumental",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("inspectAudioFile", () => {
  it("maps common audio extensions", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "songpad-mcp-"));
    const filePath = path.join(directory, "demo.wav");
    await writeFile(filePath, Buffer.from("fake"));

    try {
      const file = await inspectAudioFile(filePath, 50);
      expect(file.mimeType).toBe("audio/wav");
      expect(file.fileName).toBe("demo.wav");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects unsupported extensions", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "songpad-mcp-"));
    const filePath = path.join(directory, "notes.txt");
    await writeFile(filePath, Buffer.from("hello"));

    try {
      await expect(inspectAudioFile(filePath, 50)).rejects.toThrow(
        "Unsupported audio type",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
