import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guards";
import type { AuthContext } from "@/lib/auth/types";
import { createSong, listSongs } from "@/lib/services/songs";
import { GET, POST } from "./route";

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/services/songs", () => ({
  listSongs: vi.fn(),
  createSong: vi.fn(),
}));

const mockedRequireUser = vi.mocked(requireUser);
const mockedListSongs = vi.mocked(listSongs);
const mockedCreateSong = vi.mocked(createSong);

const auth: AuthContext = {
  userId: "user-1",
  email: "user@example.com",
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

function request(method: string, body?: unknown): Request {
  return new Request("http://localhost:3000/api/songs?limit=10", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("songs collection route", () => {
  it("lists songs with the read scope", async () => {
    mockedRequireUser.mockResolvedValue(auth);
    mockedListSongs.mockResolvedValue({ songs: [], nextCursor: null });

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(200);
    expect(mockedRequireUser).toHaveBeenCalledWith(expect.any(Request), {
      scope: "songs:read",
    });
    expect(mockedListSongs).toHaveBeenCalledWith("user-1", { limit: 10 });
  });

  it("returns 201 when a song is created", async () => {
    mockedRequireUser.mockResolvedValue(auth);
    mockedCreateSong.mockResolvedValue({
      created: true,
      song: {
        id: "song-1",
        title: "Demo",
        updatedAt: "2026-01-01T00:00:00.000Z",
        hasInstrumental: false,
        instrumentalFileName: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        lyricsJson: { type: "doc", content: [] },
        lyricsText: "",
        instrumental: null,
      },
    });

    const response = await POST(
      request("POST", { title: "Demo", lyricsPlain: "hello" }),
      context,
    );

    expect(response.status).toBe(201);
    expect(mockedCreateSong).toHaveBeenCalledWith("user-1", {
      title: "Demo",
      lyricsPlain: "hello",
    });
  });

  it("returns 200 when the import key already exists", async () => {
    mockedRequireUser.mockResolvedValue(auth);
    mockedCreateSong.mockResolvedValue({
      created: false,
      song: {
        id: "song-1",
        title: "Demo",
        updatedAt: "2026-01-01T00:00:00.000Z",
        hasInstrumental: false,
        instrumentalFileName: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        lyricsJson: { type: "doc", content: [] },
        lyricsText: "",
        instrumental: null,
      },
    });

    const response = await POST(
      request("POST", { title: "Demo", lyricsPlain: "hello", importKey: "demo" }),
      context,
    );

    expect(response.status).toBe(200);
  });

  it("rejects both lyric formats before calling the service", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequireUser.mockResolvedValue(auth);

    const response = await POST(
      request("POST", {
        title: "Demo",
        lyricsPlain: "hello",
        lyricsJson: { type: "doc", content: [] },
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mockedCreateSong).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequireUser.mockRejectedValue(
      new ApiError("UNAUTHENTICATED", "Authentication required"),
    );

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(401);
  });
});
