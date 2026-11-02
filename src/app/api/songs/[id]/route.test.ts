import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guards";
import type { AuthContext } from "@/lib/auth/types";
import { deleteSong, getSong, updateSong } from "@/lib/services/songs";
import { DELETE, GET, PATCH } from "./route";

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/services/songs", () => ({
  getSong: vi.fn(),
  updateSong: vi.fn(),
  deleteSong: vi.fn(),
}));

const mockedRequireUser = vi.mocked(requireUser);
const mockedGetSong = vi.mocked(getSong);
const mockedUpdateSong = vi.mocked(updateSong);
const mockedDeleteSong = vi.mocked(deleteSong);

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

const context = { params: Promise.resolve({ id: "song-1" }) };

const song = {
  id: "song-1",
  title: "Demo",
  updatedAt: "2026-01-01T00:00:00.000Z",
  hasInstrumental: false,
  instrumentalFileName: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lyricsJson: { type: "doc" as const, content: [] },
  lyricsText: "",
  instrumental: null,
};

function request(method: string, body?: unknown): Request {
  return new Request("http://localhost:3000/api/songs/song-1", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("song item route", () => {
  it("returns a song with the read scope", async () => {
    mockedRequireUser.mockResolvedValue(auth);
    mockedGetSong.mockResolvedValue(song);

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(200);
    expect(mockedRequireUser).toHaveBeenCalledWith(expect.any(Request), {
      scope: "songs:read",
    });
    expect(mockedGetSong).toHaveBeenCalledWith("user-1", "song-1");
  });

  it("patches a song with the write scope", async () => {
    mockedRequireUser.mockResolvedValue(auth);
    mockedUpdateSong.mockResolvedValue({ ...song, title: "Renamed" });

    const response = await PATCH(
      request("PATCH", { title: "Renamed" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mockedUpdateSong).toHaveBeenCalledWith("user-1", "song-1", {
      title: "Renamed",
    });
  });

  it("deletes a song with the delete scope and returns 204", async () => {
    mockedRequireUser.mockResolvedValue(auth);
    mockedDeleteSong.mockResolvedValue(undefined);

    const response = await DELETE(request("DELETE"), context);

    expect(response.status).toBe(204);
    expect(mockedRequireUser).toHaveBeenCalledWith(expect.any(Request), {
      scope: "songs:delete",
    });
  });

  it("returns 404 for another user's song", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequireUser.mockResolvedValue(auth);
    mockedGetSong.mockRejectedValue(new ApiError("NOT_FOUND", "Song not found"));

    const response = await GET(request("GET"), context);

    expect(response.status).toBe(404);
  });

  it("rejects an empty patch before calling the service", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedRequireUser.mockResolvedValue(auth);

    const response = await PATCH(request("PATCH", {}), context);

    expect(response.status).toBe(400);
    expect(mockedUpdateSong).not.toHaveBeenCalled();
  });
});
