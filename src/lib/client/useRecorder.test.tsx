// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecorder } from "./useRecorder";

class MockMediaRecorder {
  static isTypeSupported = vi.fn((mime: string) => mime === "audio/webm;codecs=opus" || mime === "audio/mp4");
  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: MediaStream, options?: MediaRecorderOptions) { this.mimeType = options?.mimeType ?? "audio/webm"; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["voice"]) } as BlobEvent); this.onstop?.(); }
}

const stopTrack = vi.fn();
const getUserMedia = vi.fn();

beforeEach(() => {
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  getUserMedia.mockReset(); stopTrack.mockReset();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
});
afterEach(() => vi.unstubAllGlobals());

describe("useRecorder", () => {
  it("selects the preferred mime type, times and releases the mic after stop", async () => {
    const { result } = renderHook(() => useRecorder(10_000_000));
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe("recording");
    expect(result.current.mimeType).toBe("audio/webm;codecs=opus");
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    act(() => result.current.stop());
    expect(result.current.state).toBe("stopped");
    expect(result.current.blob?.size).toBeGreaterThan(0);
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it("reports a clear permission-denied error", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { result } = renderHook(() => useRecorder(1000));
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe("error");
    expect(result.current.message).toContain("permission was denied");
  });
});
