import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { plainTextToTiptap } from "@/lib/lyrics/convert";
import { cleanupSongMedia } from "@/lib/services/media";
import { Song } from "@/models/Song";
import {
  createSong,
  deleteSong,
  getSong,
  listSongs,
  updateSong,
} from "./songs";

vi.mock("@/models/Song", () => ({
  Song: {
    countDocuments: vi.fn().mockResolvedValue(0),
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit/window", () => ({ enforceWindowLimit: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/services/media", () => ({
  cleanupSongMedia: vi.fn(),
}));

const find = Song.find as unknown as Mock;
const findOne = Song.findOne as unknown as Mock;
const create = Song.create as unknown as Mock;
const deleteOne = Song.deleteOne as unknown as Mock;
const mockedCleanup = vi.mocked(cleanupSongMedia);

function queryChain(result: unknown) {
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn().mockResolvedValue(result),
  };

  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

let sequence = 0;

function makeSong(overrides: Record<string, unknown> = {}) {
  sequence += 1;
  return {
    _id: new Types.ObjectId(),
    title: `Song ${sequence}`,
    titleNormalized: `song ${sequence}`,
    lyricsJson: plainTextToTiptap("hello"),
    lyricsText: "hello",
    instrumental: null,
    driveFolderId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

beforeEach(() => { (Song.countDocuments as unknown as Mock).mockResolvedValue(0); });

describe("listSongs", () => {
  it("scopes results to the user and returns a cursor", async () => {
    const newest = makeSong({ updatedAt: new Date("2026-02-02T00:00:00Z") });
    const older = makeSong({ updatedAt: new Date("2026-02-01T00:00:00Z") });
    find.mockReturnValue(queryChain([newest, older]));

    const result = await listSongs("user-1", { limit: 1 });

    expect(find).toHaveBeenCalledWith({ userId: "user-1" });
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].id).toBe(String(newest._id));
    expect(result.nextCursor).not.toBeNull();
  });

  it("ranks title matches first and includes lyric snippets", async () => {
    const titleMatch = makeSong({ title: "Love Song", lyricsText: "nothing" });
    const lyricsMatch = makeSong({
      title: "Other",
      lyricsText: "I really love you tonight",
    });
    find.mockReturnValue(queryChain([lyricsMatch, titleMatch]));

    const result = await listSongs("user-1", { q: "love" });

    expect(result.songs[0].id).toBe(String(titleMatch._id));
    expect(result.songs[0].matchedIn).toContain("title");
    expect(result.songs[1].matchedIn).toEqual(["lyrics"]);
    expect(result.songs[1].snippet).toContain("love");
    expect(result.nextCursor).toBeNull();
  });

  it("uses an updatedAt/id cursor for unfiltered pages", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        updatedAt: "2026-02-02T00:00:00.000Z",
        id: String(new Types.ObjectId()),
      }),
    ).toString("base64url");
    find.mockReturnValue(queryChain([]));

    await listSongs("user-1", { cursor });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", $or: expect.any(Array) }),
    );
  });

  it("rejects malformed cursors", async () => {
    await expect(
      listSongs("user-1", { cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(find).not.toHaveBeenCalled();
  });

  it("rejects overly long search queries", async () => {
    await expect(
      listSongs("user-1", { q: "a".repeat(101) }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("createSong limits", () => {
  it("rejects creation once a user reaches the configured song cap", async () => {
    (Song.countDocuments as unknown as Mock).mockResolvedValue(500);
    await expect(createSong("user-1", { title: "One too many" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("getSong", () => {
  it("rejects invalid ids without querying", async () => {
    await expect(getSong("user-1", "not-an-id")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it("does not return another user's song", async () => {
    findOne.mockReturnValue(queryChain(null));

    await expect(
      getSong("user-1", String(new Types.ObjectId())),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("createSong", () => {
  it("returns the existing song for a repeated import key", async () => {
    const existing = makeSong();
    findOne.mockReturnValue(queryChain(existing));

    const result = await createSong("user-1", {
      title: "Demo",
      lyricsPlain: "hello",
      importKey: "demo",
    });

    expect(result.created).toBe(false);
    expect(result.song.id).toBe(String(existing._id));
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a song with normalized title and derived plain text", async () => {
    findOne.mockReturnValue(queryChain(null));
    const created = makeSong({ title: "New Song" });
    create.mockResolvedValue({
      ...created,
      toObject: () => created,
    });

    const result = await createSong("user-1", {
      title: "  New Song ",
      lyricsPlain: "[Verse]\nHi",
      importKey: " new-song ",
    });

    expect(result.created).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        title: "New Song",
        titleNormalized: "new song",
        importKey: "new-song",
        lyricsText: "Verse\nHi",
      }),
    );
  });

  it("returns the winner when a concurrent insert hits the unique index", async () => {
    const existing = makeSong();
    findOne
      .mockReturnValueOnce(queryChain(null))
      .mockReturnValueOnce(queryChain(existing));
    create.mockRejectedValue({ code: 11000 });

    const result = await createSong("user-1", {
      title: "Demo",
      lyricsPlain: "hello",
      importKey: "demo",
    });

    expect(result.created).toBe(false);
    expect(result.song.id).toBe(String(existing._id));
  });

  it("rejects supplying both lyric formats", async () => {
    await expect(
      createSong("user-1", {
        title: "Demo",
        lyricsPlain: "hello",
        lyricsJson: plainTextToTiptap("hello"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("updateSong", () => {
  it("updates only the owning user's song", async () => {
    const doc = makeSong();
    const save = vi.fn().mockResolvedValue(undefined);
    const stored = { ...doc, save, toObject: () => stored };
    findOne.mockResolvedValue(stored);

    const result = await updateSong("user-1", String(doc._id), {
      title: "Renamed",
      lyricsPlain: "fresh words",
    });

    expect(findOne).toHaveBeenCalledWith({
      _id: doc._id,
      userId: "user-1",
    });
    expect(save).toHaveBeenCalled();
    expect(result.title).toBe("Renamed");
  });

  it("returns 404 when the song is not owned by the user", async () => {
    findOne.mockResolvedValue(null);

    await expect(
      updateSong("user-1", String(new Types.ObjectId()), { title: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an empty update", async () => {
    const doc = makeSong();
    findOne.mockResolvedValue({
      ...doc,
      save: vi.fn(),
      toObject: () => doc,
    });

    await expect(
      updateSong("user-1", String(doc._id), {}),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("deleteSong", () => {
  it("cleans up media before deleting the owned song", async () => {
    const doc = makeSong();
    findOne.mockResolvedValue(doc);
    deleteOne.mockResolvedValue({ acknowledged: true });

    await deleteSong("user-1", String(doc._id));

    expect(mockedCleanup).toHaveBeenCalledWith({
      _id: String(doc._id),
      userId: "user-1",
      instrumental: null,
      driveFolderId: null,
    });
    expect(deleteOne).toHaveBeenCalledWith({
      _id: doc._id,
      userId: "user-1",
    });
  });

  it("returns 404 for a missing song", async () => {
    findOne.mockResolvedValue(null);

    await expect(
      deleteSong("user-1", String(new Types.ObjectId())),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockedCleanup).not.toHaveBeenCalled();
  });
});
