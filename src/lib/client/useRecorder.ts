"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting-permission" | "recording" | "stopped" | "error";
export interface RecorderResult {
  state: RecorderState;
  blob: Blob | null;
  mimeType: string;
  durationMs: number;
  elapsedMs: number;
  message: string;
  sizeLimitReached: boolean;
  start(): Promise<boolean>;
  stop(): void;
  reset(): void;
}

const MIME_PREFERENCES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];

export function useRecorder(maxBytes: number): RecorderResult {
  const [state, setState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [message, setMessage] = useState("");
  const [sizeLimitReached, setSizeLimitReached] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bytesRef = useRef(0);
  const cancelPermissionRef = useRef(false);

  const releaseTracks = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (state === "requesting-permission") {
      cancelPermissionRef.current = true;
      setState("idle");
      releaseTracks();
      return;
    }
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else if (!recorder) releaseTracks();
  }, [releaseTracks, state]);

  const start = useCallback(async (): Promise<boolean> => {
    setBlob(null); setDurationMs(0); setElapsedMs(0); setMessage(""); setSizeLimitReached(false); chunksRef.current = []; bytesRef.current = 0;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error"); setMessage("This browser does not support microphone recording."); return false;
    }
    cancelPermissionRef.current = false;
    setState("requesting-permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (cancelPermissionRef.current) { stream.getTracks().forEach((track) => track.stop()); return false; }
      streamRef.current = stream;
      const mime = MIME_PREFERENCES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      setMimeType(recorder.mimeType || mime || "audio/webm");
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunksRef.current.push(event.data); bytesRef.current += event.data.size;
        if (maxBytes > 0 && bytesRef.current >= maxBytes * 0.9) {
          setSizeLimitReached(true);
          if (bytesRef.current >= maxBytes * 0.95) stop();
        }
      };
      recorder.onerror = () => { releaseTracks(); setState("error"); setMessage("Recording stopped because the microphone encountered an error."); };
      recorder.onstop = () => {
        const elapsed = Math.max(0, Date.now() - startedAtRef.current);
        const output = new Blob(chunksRef.current, { type: recorder.mimeType || mime || "audio/webm" });
        setBlob(output); setDurationMs(elapsed); setElapsedMs(elapsed); setState("stopped");
        if (bytesRef.current >= maxBytes * 0.9) setMessage("Recording stopped near the upload size limit. Review and save this take.");
        releaseTracks();
      };
      startedAtRef.current = Date.now();
      recorder.start(1000);
      setState("recording");
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
      return true;
    } catch (error) {
      releaseTracks(); setState("error");
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setMessage("Microphone permission was denied. Allow microphone access and try again.");
      else if (name === "NotFoundError" || name === "DevicesNotFoundError") setMessage("No microphone was found. Connect an input device and try again.");
      else setMessage("Could not start recording. Check your microphone and browser permissions.");
      return false;
    }
  }, [maxBytes, releaseTracks, stop]);

  const reset = useCallback(() => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); releaseTracks(); chunksRef.current = []; setBlob(null); setDurationMs(0); setElapsedMs(0); setMessage(""); setState("idle"); setSizeLimitReached(false); }, [releaseTracks]);

  useEffect(() => () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); releaseTracks(); }, [releaseTracks]);

  return { state, blob, mimeType, durationMs, elapsedMs, message, sizeLimitReached, start, stop, reset };
}
