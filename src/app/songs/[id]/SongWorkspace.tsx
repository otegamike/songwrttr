"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import type { SongDetail } from "@/lib/services/songSerialization";
import { evict, getAudioUrl } from "@/lib/client/audioCache";
import { TakeSection } from "./TakeSection";
import styles from "./song.module.css";

const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Something went wrong";

export function SongWorkspace({ initialSong, maxTakeMb }: { initialSong: SongDetail; maxTakeMb: number }) {
  const router = useRouter();
  const [song, setSong] = useState(initialSong);
  const [editing, setEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [titleEditing, setTitleEditing] = useState(false);
  const [title, setTitle] = useState(song.title);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioStatus, setAudioStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const uploadXhr = useRef<XMLHttpRequest | null>(null);
  const latestJson = useRef(song.lyricsJson);
  const savedJson = useRef(JSON.stringify(song.lyricsJson));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const editor = useEditor({ extensions: [StarterKit, Underline], content: song.lyricsJson, editable: false, immediatelyRender: false, onUpdate: ({ editor: ed }) => { latestJson.current = ed.getJSON() as typeof song.lyricsJson; setSaveStatus("Unsaved changes"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void saveRef.current(), 1000); } });

  const saveLyrics = useCallback(async () => {
    if (!editor) return;
    const json = latestJson.current;
    if (JSON.stringify(json) === savedJson.current) { setSaveStatus("Saved"); return; }
    setSaveStatus("Saving…");
    try { const response = await fetch(`/api/songs/${song.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lyricsJson: json }) }); if (!response.ok) throw new Error(); const body = await response.json(); setSong(body.song); savedJson.current = JSON.stringify(json); setSaveStatus("Saved"); }
    catch { setSaveStatus("Couldn’t save, retrying"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void saveRef.current(), 2500); }
  }, [editor, song.id]);

  useEffect(() => { saveRef.current = saveLyrics; }, [saveLyrics]);
  useEffect(() => { editor?.setEditable(editing); }, [editor, editing]);
  useEffect(() => {
    if (!editor) return;
    const flush = () => { if (timer.current) clearTimeout(timer.current); void saveRef.current(); };
    editor.on("blur", flush);
    return () => { editor.off("blur", flush); };
  }, [editor]);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (JSON.stringify(latestJson.current) !== savedJson.current) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function saveTitle() { const next = title.trim(); setTitleEditing(false); if (!next || next === song.title) { setTitle(song.title); return; } try { const res = await fetch(`/api/songs/${song.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: next }) }); if (!res.ok) throw new Error(); const body = await res.json(); setSong(body.song); setTitle(body.song.title); } catch { setTitle(song.title); setError("Could not save title."); } }
  const loadAudio = useCallback(async (): Promise<string | null> => { if (!song.instrumental) return null; setAudioStatus("Loading instrumental…"); setProgress(0); try { const url = await getAudioUrl(song.instrumental.driveFileId, song.instrumental.md5Checksum, (loaded, total) => setProgress(total ? Math.round(loaded / total * 100) : 0)); setAudioUrl(url); setAudioStatus(""); return url; } catch (e) { const status = (e as { status?: number }).status; const body = (e as { body?: { error?: { code?: string } } }).body; if (status === 410 || body?.error?.code === "FILE_MISSING") setAudioStatus("This file is missing from your Drive."); else if (body?.error?.code === "DRIVE_RECONNECT_REQUIRED") setAudioStatus("Reconnect Google Drive to play this instrumental."); else setAudioStatus(errorMessage(e)); return null; } }, [song.instrumental]);
  const stopInstrumental = useCallback(() => { audioRef.current?.pause(); }, []);
  const startInstrumental = useCallback(async () => { if (!song.instrumental) return; window.dispatchEvent(new Event("songpad:pause-takes")); const url = audioUrl || await loadAudio(); if (!url || !audioRef.current) return; audioRef.current.src = url; await audioRef.current.play(); }, [audioUrl, loadAudio, song.instrumental]);
  async function upload(file: File) { setUploading(true); setError(""); try { const sessionRes = await fetch(`/api/songs/${song.id}/instrumental/upload-session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type || "audio/mpeg", size: file.size }) }); const session = await sessionRes.json(); if (!sessionRes.ok) throw new Error(session.error?.code === "DRIVE_QUOTA_EXCEEDED" ? "Google Drive storage quota exceeded." : session.error?.message ?? "Could not start upload."); const driveFileId = await new Promise<string>((resolve, reject) => { const xhr = new XMLHttpRequest(); uploadXhr.current = xhr; xhr.open("PUT", session.uploadUrl); xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg"); xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgress(Math.round(e.loaded / e.total * 100)); }; xhr.onload = () => { if (xhr.status < 200 || xhr.status >= 300) return reject(new Error("Upload failed. Retry the upload.")); try { resolve(JSON.parse(xhr.responseText).id); } catch { reject(new Error("Drive returned an invalid upload response.")); } }; xhr.onerror = () => reject(new Error("Network failure. Retry the upload.")); xhr.onabort = () => reject(new Error("Upload cancelled.")); xhr.send(file); }); uploadXhr.current = null; const complete = await fetch(`/api/songs/${song.id}/instrumental/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: session.uploadId, driveFileId }) }); const body = await complete.json(); if (!complete.ok) throw new Error(body.error?.code === "TOO_LARGE" ? "File is too large." : body.error?.message ?? "Could not finish upload."); if (song.instrumental) await evict(song.instrumental.driveFileId); setSong(body.song); setAudioUrl(""); setAudioStatus(""); }
    catch (e) { setError(errorMessage(e)); } finally { uploadXhr.current = null; setUploading(false); setUploadProgress(0); } }
  async function removeInstrumental() { if (!song.instrumental || !window.confirm("Remove this instrumental from the song?")) return; try { const res = await fetch(`/api/songs/${song.id}/instrumental`, { method: "DELETE" }); if (!res.ok) throw new Error("Could not remove instrumental"); await evict(song.instrumental.driveFileId); setSong({ ...song, hasInstrumental: false, instrumentalFileName: null, instrumental: null }); setAudioUrl(""); } catch (e) { setError(errorMessage(e)); } }
  async function deleteSong() { if (!window.confirm(`Delete “${song.title}” and its linked media?`)) return; const res = await fetch(`/api/songs/${song.id}`, { method: "DELETE" }); if (res.ok) router.push("/songs"); else setError("Could not delete this song. Linked media may need attention."); }

  return <main className={styles.main}>
    <header className={styles.top}><Link href="/songs" className={styles.back}>← Songs</Link><button className={styles.more} type="button" onClick={deleteSong}>Delete song</button></header>
    <section className={styles.titleSection}>{titleEditing ? <input aria-label="Song title" className={styles.titleInput} value={title} autoFocus onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } if (e.key === "Escape") { setTitle(song.title); setTitleEditing(false); } }} /> : <><h1>{song.title}</h1><button className={styles.textButton} type="button" onClick={() => setTitleEditing(true)}>Edit title</button></>}</section>
    <section className={styles.panel}><div className={styles.sectionHead}><div><p className={styles.eyebrow}>Write</p><h2>Lyrics</h2></div><div className={styles.editControls}><span aria-live="polite">{saveStatus}</span><button aria-pressed={editing} className={styles.primary} type="button" onClick={() => { if (editing) { if (timer.current) clearTimeout(timer.current); void saveLyrics(); } setEditing(!editing); }}>{editing ? "Done editing" : "✎ Edit lyrics"}</button></div></div>
      {editing && <div className={styles.toolbar} role="toolbar" aria-label="Lyrics formatting"><button type="button" aria-label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button><button type="button" aria-label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button><button type="button" aria-label="Underline" onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></button><button type="button" aria-label="Heading" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H</button><button type="button" aria-label="Bullet list" onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button></div>}
      <div className={`${styles.lyrics} ${editing ? styles.lyricsEditing : ""}`}><EditorContent editor={editor}/></div>
    </section>
    <section className={styles.panel}><div className={styles.sectionHead}><div><p className={styles.eyebrow}>Your beat</p><h2>Instrumental</h2></div></div>
      {!song.instrumental ? <label className={styles.uploadLabel}>Add instrumental<input type="file" accept="audio/*,.mp3" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = ""; }}/></label> : <><p className={styles.fileName}>♫ {song.instrumental.fileName}</p><div className={styles.audioActions}><button className={styles.primary} type="button" disabled={!audioUrl && Boolean(audioStatus && audioStatus.includes("Reconnect"))} onClick={() => { if (!audioUrl) void loadAudio(); else if (audioRef.current?.paused) void audioRef.current.play(); else audioRef.current?.pause(); }}>{audioUrl ? (playing ? "Pause" : "Play") : "Load & play"}</button><label className={styles.uploadLabel}>Replace<input type="file" accept="audio/*,.mp3" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = ""; }}/></label><button type="button" className={styles.textButton} onClick={() => void removeInstrumental()}>Remove</button></div><audio ref={audioRef} src={audioUrl || undefined} preload="metadata" onPlay={() => { setPlaying(true); window.dispatchEvent(new Event("songpad:pause-takes")); }} onPause={() => setPlaying(false)} onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} onEnded={() => setPlaying(false)} />{audioUrl && <div className={styles.seek}><span>{formatTime(current)}</span><input aria-label="Seek instrumental" type="range" min="0" max={duration || 0} step="0.1" value={current} onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = Number(e.target.value); }}/><span>{formatTime(duration)}</span></div>}</>}
      {audioStatus && <p className={styles.notice} role="status">{audioStatus} {audioStatus.includes("Reconnect") && <button type="button" className={styles.textButton} onClick={() => void signIn("google", { callbackUrl: `/songs/${song.id}` }, { prompt: "consent" })}>Reconnect Google Drive</button>} {audioStatus.includes("missing") && <button type="button" onClick={() => void removeInstrumental()}>Remove missing file</button>}</p>}{progress > 0 && <progress max="100" value={progress}/ >}
      {uploading && <div className={styles.progress}><progress max="100" value={uploadProgress}/><span>Uploading {uploadProgress}%</span><button type="button" className={styles.textButton} onClick={() => uploadXhr.current?.abort()}>Cancel upload</button></div>}
      <TakeSection songId={song.id} songTitle={song.title} maxTakeMb={maxTakeMb} instrumentalRef={audioRef} startInstrumental={startInstrumental} stopInstrumental={stopInstrumental}/>
    </section>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </main>;
}
function formatTime(seconds: number) { if (!Number.isFinite(seconds)) return "0:00"; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
