import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clear, configureAudioCache, getAudioUrl } from "./audioCache";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock);
  await clear().catch(() => undefined);
  configureAudioCache({ maxBytes: 500 * 1024 * 1024 });
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("audio cache", () => {
  it("fetches and stores a cache miss, then serves the hit without a request", async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(["audio"]), { headers: { "content-type": "audio/mpeg" } }));
    const first = await getAudioUrl("drive-a", "sum-a");
    const second = await getAudioUrl("drive-a", "sum-a");
    expect(first).toMatch(/^blob:/);
    expect(second).toMatch(/^blob:/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used file when the configured cap is exceeded", async () => {
    configureAudioCache({ maxBytes: 12 });
    fetchMock.mockImplementation(async (input) => new Response(new Blob([String(input).includes("drive-b") ? "bbbbbb" : "aaaaaa"]), { headers: { "content-type": "audio/mpeg" } }));
    await getAudioUrl("drive-a", "sum-a");
    await getAudioUrl("drive-b", "sum-b");
    await getAudioUrl("drive-a", "sum-a");
    await getAudioUrl("drive-c", "sum-c");
    fetchMock.mockClear();
    await getAudioUrl("drive-a", "sum-a");
    await getAudioUrl("drive-c", "sum-c");
    expect(fetchMock).not.toHaveBeenCalled();
    await getAudioUrl("drive-b", "sum-b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the streaming URL when IndexedDB is unavailable", async () => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", undefined);
    const cache = await import("./audioCache");
    expect(await cache.getAudioUrl("drive-a", "sum-a")).toBe("/api/media/drive-a");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to streaming when a media fetch fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    expect(await getAudioUrl("drive-a", "sum-a")).toBe("/api/media/drive-a");
  });
});
