"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { cacheAudioBlob, evict, getAudioUrl } from "@/lib/client/audioCache";
import { deletePendingTake, listPendingTakes, savePendingTake, type PendingTake } from "@/lib/client/pendingTakes";
import { useRecorder } from "@/lib/client/useRecorder";
import styles from "./takes.module.css";

type Take = { id: string; name: string; driveFileId: string; url: string; mimeType: string; size: number; md5Checksum: string; durationMs: number; createdAt: string };
interface Props { songId: string; songTitle: string; maxTakeMb: number; instrumentalRef: RefObject<HTMLAudioElement | null>; startInstrumental(): Promise<void>; stopInstrumental(): void }

export function TakeSection({ songId, songTitle, maxTakeMb, instrumentalRef, startInstrumental, stopInstrumental }: Props) {
  const recorder = useRecorder(maxTakeMb * 1024 * 1024);
  const { state: recorderState, stop: stopRecording } = recorder;
  const [takes, setTakes] = useState<Take[]>([]);
  const [pending, setPending] = useState<PendingTake[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState("");
  const [takeUrl, setTakeUrl] = useState("");
  const [takePlaying, setTakePlaying] = useState(false);
  const [activeTake, setActiveTake] = useState("");
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const takeAudio = useRef<HTMLAudioElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const reviewUrl = useMemo(() => recorder.blob ? URL.createObjectURL(recorder.blob) : "", [recorder.blob]);
  const supported = typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const reload = useCallback(async () => {
    try { const [takeResponse, savedPending] = await Promise.all([fetch(`/api/songs/${songId}/takes`), listPendingTakes(songId)]); if (!takeResponse.ok) throw new Error("Could not load recordings"); const body = await takeResponse.json(); setTakes(body.takes); setPending(savedPending); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not load recordings"); }
  }, [songId]);
  useEffect(() => { const frame = requestAnimationFrame(() => { void reload(); setNotice(localStorage.getItem("songpad-headphones-notice") !== "dismissed"); }); return () => cancelAnimationFrame(frame); }, [reload]);
  useEffect(() => { const onPause = () => { takeAudio.current?.pause(); setTakePlaying(false); }; window.addEventListener("songpad:pause-takes", onPause); return () => window.removeEventListener("songpad:pause-takes", onPause); }, []);
  useEffect(() => { if (takePlaying) stopInstrumental(); }, [takePlaying, stopInstrumental]);
  useEffect(() => { const audio = instrumentalRef.current; if (!audio) return; const ended = () => { if (recorderState === "recording") stopRecording(); }; audio.addEventListener("ended", ended); return () => audio.removeEventListener("ended", ended); }, [instrumentalRef, recorderState, stopRecording]);
  useEffect(() => { const visibility = () => { if (document.visibilityState === "visible" && recorderState === "recording") setMessage("Recording continued while this tab was hidden. Stop when you are ready."); }; document.addEventListener("visibilitychange", visibility); return () => document.removeEventListener("visibilitychange", visibility); }, [recorderState]);
  useEffect(() => {
    if (recorderState !== "recording" && recorderState !== "requesting-permission") return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guardLinks = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.origin !== window.location.origin || link.pathname === window.location.pathname) return;
      if (!window.confirm("Recording will stop and the current take will be lost if you leave this song. Leave anyway?")) { event.preventDefault(); event.stopPropagation(); return; }
      stopRecording(); stopInstrumental();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardLinks, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardLinks, true); };
  }, [recorderState, stopRecording, stopInstrumental]);
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl); if (takeUrl.startsWith("blob:")) URL.revokeObjectURL(takeUrl); }, [reviewUrl, takeUrl]);
  useEffect(() => {
    if (!sheetOpen) return;
    const frame = requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>("button, input, audio[controls]")?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSheetOpen(false); return; }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const items = [...sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), audio[controls]')];
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", onKey); };
  }, [sheetOpen]);

  async function toggleRecord() {
    setMessage("");
    if (recorderState === "recording" || recorderState === "requesting-permission") { stopRecording(); stopInstrumental(); return; }
    if (takePlaying) { takeAudio.current?.pause(); setTakePlaying(false); }
    if (notice && !localStorage.getItem("songpad-headphones-notice")) localStorage.setItem("songpad-headphones-notice", "shown");
    window.dispatchEvent(new Event("songpad:pause-takes"));
    const recording = recorder.start();
    if (instrumentalRef.current) { try { await startInstrumental(); } catch { setMessage("The microphone started, but the instrumental could not play. Stop to keep the vocal take safely."); } }
    if (!(await recording)) stopInstrumental();
  }

  async function uploadBlob(blob: Blob, mimeType: string, durationMs: number, requestedName: string, pendingId?: string) {
    setBusy(true); setProgress(0); setMessage("");
    try {
      const uploadMimeType = mimeType.split(";")[0].trim();
      const fileName = `${songTitle} - ${requestedName}.${uploadMimeType.includes("mp4") ? "m4a" : uploadMimeType.includes("ogg") ? "ogg" : "webm"}`;
      const sessionRes = await fetch(`/api/songs/${songId}/takes/upload-session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName, mimeType: uploadMimeType, size: blob.size }) });
      const session = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(session.error?.code === "DRIVE_QUOTA_EXCEEDED" ? "Google Drive storage quota exceeded. The take has been kept on this device." : session.error?.code === "DRIVE_RECONNECT_REQUIRED" ? "Reconnect Google Drive to save. The take has been kept on this device." : session.error?.message ?? "Could not start upload.");
      const driveFileId = await new Promise<string>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open("PUT", session.uploadUrl); xhr.setRequestHeader("Content-Type", uploadMimeType); xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); }; xhr.onload = () => { if (xhr.status < 200 || xhr.status >= 300) return reject(new Error("Upload failed. Retry from pending recordings.")); try { resolve(JSON.parse(xhr.responseText).id); } catch { reject(new Error("Drive returned an invalid upload result.")); } }; xhr.onerror = () => reject(new Error("Network failure. Retry from pending recordings.")); xhr.send(blob); });
      const completed = await fetch(`/api/songs/${songId}/takes/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: session.uploadId, driveFileId, durationMs, name: requestedName }) });
      const result = await completed.json(); if (!completed.ok) throw new Error(result.error?.message ?? "Could not complete take upload.");
      await cacheAudioBlob(result.take.driveFileId, result.take.md5Checksum, blob).catch(() => undefined);
      setTakes((current) => [result.take, ...current]);
      if (pendingId) { await deletePendingTake(pendingId); setPending((current) => current.filter((item) => item.id !== pendingId)); }
      setMessage("Take saved to Google Drive."); setName(""); if (!pendingId) recorder.reset();
    } catch (error) {
      let stored = Boolean(pendingId);
      if (!pendingId) try { const item = await savePendingTake({ songId, name: requestedName, blob, mimeType, durationMs }); setPending((current) => [item, ...current.filter((entry) => entry.id !== item.id)]); stored = true; }
      catch { /* keep the review blob in the panel and report storage failure */ }
      if (stored && !pendingId) recorder.reset();
      setMessage(`${error instanceof Error ? error.message : "Upload failed."} ${stored ? "A local pending copy is available for retry." : "The take is still in the review panel; keep this page open and retry."}`);
    } finally { setBusy(false); setProgress(0); }
  }

  async function playTake(take: Take) {
    if (recorderState === "recording" || recorderState === "requesting-permission") return;
    if (activeTake === take.id && takePlaying) { takeAudio.current?.pause(); setTakePlaying(false); return; }
    stopInstrumental(); window.dispatchEvent(new Event("songpad:pause-takes"));
    try { const url = await getAudioUrl(take.driveFileId, take.md5Checksum); setTakeUrl(url); setActiveTake(take.id); }
    catch { setMessage("Could not load this recording."); }
  }
  async function saveRename(take: Take) {
    const next = renameValue.trim(); if (!next) return;
    const response = await fetch(`/api/takes/${take.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) });
    if (response.ok) { const body = await response.json(); setTakes((current) => current.map((item) => item.id === take.id ? body.take : item)); setRenameId(""); }
    else setMessage("Could not rename this recording.");
  }
  async function removeTake(take: Take) {
    if (!window.confirm(`Delete “${take.name}”? This also trashes its Drive file.`)) return;
    const response = await fetch(`/api/takes/${take.id}`, { method: "DELETE" });
    if (response.ok) { await evict(take.driveFileId); setTakes((current) => current.filter((item) => item.id !== take.id)); if (activeTake === take.id) { setTakeUrl(""); setTakePlaying(false); } }
    else setMessage("Could not delete this recording.");
  }

  return <section className={styles.recordingArea}>
    {!supported ? <p role="status" className={styles.callout}>Recording is not available in this browser. Try a recent desktop or mobile browser with microphone support.</p> : <>
      {notice && <p className={styles.callout}>Use headphones so the beat isn’t picked up by your mic. <button type="button" onClick={() => { localStorage.setItem("songpad-headphones-notice", "dismissed"); setNotice(false); }}>Got it</button></p>}
      <div className={styles.recordRow}><button className={recorderState === "recording" ? styles.stop : styles.record} type="button" disabled={busy || takePlaying} onClick={() => void toggleRecord()}>{recorderState === "recording" ? "Stop recording" : recorderState === "requesting-permission" ? "Requesting microphone…" : "● Record"}</button>{recorderState === "recording" && <span aria-live="polite">Recording · {formatDuration(recorder.elapsedMs)}</span>}</div>
      {recorder.sizeLimitReached && recorderState === "recording" && <p className={styles.callout} role="status">This take is nearing the upload size limit and will stop safely soon.</p>}
      {recorder.message && <p role="status" className={styles.callout}>{recorder.message}</p>}
      {recorderState === "error" && <p role="alert" className={styles.error}>{recorder.message}</p>}
      {recorder.blob && <div className={styles.review}><h3>Review take</h3><audio controls src={reviewUrl}/><label>Take name<input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder={`Take ${takes.length + 1}`}/></label><div className={styles.row}><button type="button" disabled={busy} onClick={() => void uploadBlob(recorder.blob!, recorder.mimeType, recorder.durationMs, name.trim() || `Take ${takes.length + 1}`)}>{busy ? `Uploading ${progress}%` : "Save take"}</button><button type="button" disabled={busy} onClick={() => { if (window.confirm("Discard this take?")) recorder.reset(); }}>Discard</button></div>{busy && <progress max="100" value={progress}/>}</div>}
      {message && <p role="status" className={styles.callout}>{message}</p>}
      <button type="button" className={styles.takesBar} onClick={() => setSheetOpen(true)}>Recordings ({takes.length}{pending.length ? ` · ${pending.length} pending` : ""}) <span>↑</span></button>
      {sheetOpen && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setSheetOpen(false); }}><section className={styles.sheet} ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="takes-title"><div className={styles.sheetHead}><h2 id="takes-title">Recordings</h2><button type="button" aria-label="Close recordings" onClick={() => setSheetOpen(false)}>Close</button></div><div className={styles.takeList}>
        {pending.map((item) => <article className={styles.takeCard} key={item.id}><div><strong>{item.name}</strong><p>Pending · {formatDuration(item.durationMs)}</p></div><button type="button" disabled={busy} onClick={() => void uploadBlob(item.blob, item.mimeType, item.durationMs, item.name, item.id)}>Retry upload</button><button type="button" onClick={() => { if (window.confirm("Discard this pending take?")) { void deletePendingTake(item.id).then(() => setPending((current) => current.filter((entry) => entry.id !== item.id))); } }}>Discard</button></article>)}
        {takes.map((take) => <article className={styles.takeCard} key={take.id}>{renameId === take.id ? <input autoFocus value={renameValue} maxLength={100} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveRename(take); if (e.key === "Escape") setRenameId(""); }}/> : <div><strong>{take.name}</strong><p>{formatDuration(take.durationMs)} · {new Date(take.createdAt).toLocaleDateString()}</p></div>}<button type="button" disabled={recorderState === "recording" || recorderState === "requesting-permission"} onClick={() => void playTake(take)}>{activeTake === take.id && takePlaying ? "Pause" : "Play"}</button>{renameId === take.id ? <button type="button" onClick={() => void saveRename(take)}>Save name</button> : <button type="button" onClick={() => { setRenameId(take.id); setRenameValue(take.name); }}>Rename</button>}<button type="button" onClick={() => void removeTake(take)}>Delete</button></article>)}
        {!takes.length && !pending.length && <p>No recordings yet. Your saved takes will appear here.</p>}
      </div><audio ref={takeAudio} src={takeUrl || undefined} onPlay={() => setTakePlaying(true)} onPause={() => setTakePlaying(false)} onEnded={() => setTakePlaying(false)} controls/><button className={styles.dismiss} type="button" onClick={() => setSheetOpen(false)}>Done</button></section></div>}
    </>}
  </section>;
}

function formatDuration(ms: number) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
