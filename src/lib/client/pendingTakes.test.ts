import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deletePendingTake, listPendingTakes, savePendingTake } from "./pendingTakes";

describe("pending takes", () => {
  afterEach(async () => { const items = await listPendingTakes("song-pending-test").catch(() => []); await Promise.all(items.map((item) => deletePendingTake(item.id))); vi.restoreAllMocks(); });
  it("persists failed take data locally for later retry and removes it after success", async () => {
    const saved = await savePendingTake({ songId: "song-pending-test", name: "Take 1", blob: new Blob(["audio"]), mimeType: "audio/webm", durationMs: 1400 });
    expect((await listPendingTakes("song-pending-test"))[0]).toMatchObject({ name: "Take 1", durationMs: 1400, blob: expect.any(Blob) });
    await deletePendingTake(saved.id);
    expect(await listPendingTakes("song-pending-test")).toEqual([]);
  });
});
