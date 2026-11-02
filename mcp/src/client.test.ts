import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SongPadApiError, SongPadClient } from "./client.js";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeClient(fetchImpl: typeof fetch) {
  return new SongPadClient({
    baseUrl: "http://localhost:3000",
    token: "sp_test_token",
    fetchImpl,
    sleep: vi.fn().mockResolvedValue(undefined),
    maxRetries: 2,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SongPadClient", () => {
  it("sends the bearer token and parses responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ songs: [], nextCursor: null }),
    );
    const client = makeClient(fetchImpl);

    const result = await client.searchSongs("love", 5);

    expect(result).toEqual({ songs: [], nextCursor: null });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/songs?q=love&limit=5");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer sp_test_token",
    );
  });

  it("maps API errors to a typed error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required",
          },
        },
        401,
      ),
    );
    const client = makeClient(fetchImpl);

    await expect(client.getSong("song-1")).rejects.toMatchObject({
      name: "SongPadApiError",
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      status: 401,
    });
  });

  it("retries rate limits using Retry-After", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "RATE_LIMITED", message: "Too many requests" } },
          429,
          { "Retry-After": "0" },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ songs: [], nextCursor: null }));
    const client = makeClient(fetchImpl);

    await expect(client.searchSongs()).resolves.toEqual({
      songs: [],
      nextCursor: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        429,
        { "Retry-After": "0" },
      ),
    );
    const client = makeClient(fetchImpl);

    await expect(client.searchSongs()).rejects.toBeInstanceOf(
      SongPadApiError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("streams an upload without the bearer token", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "songpad-mcp-"));
    const filePath = path.join(directory, "demo.mp3");
    await writeFile(filePath, Buffer.from("fake-mp3"));

    try {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "drive-1" }));
      const client = makeClient(fetchImpl);

      const id = await client.uploadFile(
        "https://upload.example/session",
        filePath,
        "audio/mpeg",
        8,
      );

      expect(id).toBe("drive-1");
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://upload.example/session");
      expect(new Headers(init.headers).get("Authorization")).toBeNull();
      expect(new Headers(init.headers).get("Content-Length")).toBe("8");
      expect((init as RequestInit & { duplex?: string }).duplex).toBe("half");
      expect(init.body).not.toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
