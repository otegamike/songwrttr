"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import styles from "./songs.module.css";

type Song = { id: string; title: string; hasInstrumental: boolean; matchedIn?: string[]; snippet?: string };
type Page = { songs: Song[]; nextCursor: string | null };
const listCache = new Map<string, Page>();

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((part, i) => part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part)}</>;
}

export function SongBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [page, setPage] = useState<Page>(() => listCache.get(initialQ) ?? { songs: [], nextCursor: null });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() => listCache.has(initialQ) ? "ready" : "loading");
  const [more, setMore] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      if (query.trim()) next.set("q", query.trim()); else next.delete("q");
      router.replace(`${window.location.pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      const cached = listCache.get(query.trim());
      if (cached) { setPage(cached); setStatus("ready"); } else { setStatus("loading"); }
      fetch(`/api/songs?${query.trim() ? `q=${encodeURIComponent(query.trim())}&` : ""}limit=50`)
        .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Page>; })
        .then((result) => { listCache.set(query.trim(), result); setPage(result); setStatus("ready"); })
        .catch(() => setStatus("error"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, router]);

  const loadMore = useCallback(async () => {
    if (!page.nextCursor) return;
    setMore(true);
    try {
      const params = new URLSearchParams({ limit: "50", cursor: page.nextCursor });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/songs?${params}`);
      if (!response.ok) throw new Error();
      const next = await response.json() as Page;
      setPage((current) => { const updated = { songs: [...current.songs, ...next.songs], nextCursor: next.nextCursor }; listCache.set(query.trim(), updated); return updated; });
    } catch { setStatus("error"); } finally { setMore(false); }
  }, [page.nextCursor, query]);

  async function createSong() {
    const title = window.prompt("Song title");
    if (!title?.trim()) return;
    setCreating(true);
    try {
      const response = await fetch("/api/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not create song");
      router.push(`/songs/${body.song.id}`);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Could not create song"); } finally { setCreating(false); }
  }

  return <>
    <div className={styles.searchRow}>
      <label className={styles.searchLabel} htmlFor="song-search">Search songs and lyrics</label>
      <div className={styles.searchBox}><input id="song-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your songbook" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>Clear</button>}</div>
    </div>
    {status === "loading" && page.songs.length === 0 ? <p className={styles.state} role="status">Loading songs…</p> : null}
    {status === "error" ? <p className={styles.error} role="alert">Couldn’t load songs. Check your connection and try searching again.</p> : null}
    {status === "ready" && page.songs.length === 0 ? <section className={styles.placeholder}><h2 className={styles.placeholderTitle}>{query.trim() ? "No matching songs" : "Your songbook starts here"}</h2><p className={styles.placeholderText}>{query.trim() ? "Try a different title, instrumental filename, or lyrics phrase." : "Create a song to start writing."}</p></section> : null}
    <ul className={styles.songList}>{page.songs.map((song) => <li key={song.id}><Link className={styles.songCard} href={`/songs/${song.id}`}><span className={styles.songMain}><strong>{song.title}</strong>{song.snippet && <span className={styles.snippet}><Highlight text={song.snippet} query={query.trim()} /></span>}<span className={styles.badges}>{song.matchedIn?.map((field) => <span className={styles.badge} key={field}>{field}</span>)}</span></span><span className={styles.indicator} aria-label={song.hasInstrumental ? "Instrumental attached" : "No instrumental"}>{song.hasInstrumental ? "♫" : "＋"}</span></Link></li>)}</ul>
    {page.nextCursor && <button className={styles.loadMore} type="button" disabled={more} onClick={loadMore}>{more ? "Loading…" : "Load more"}</button>}
    <button className={styles.mobileNew} type="button" disabled={creating} onClick={createSong}>＋ New song</button>
  </>;
}

export function NewSongButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className={styles.newSong} type="button" disabled={busy} onClick={async () => { const title = window.prompt("Song title"); if (!title?.trim()) return; setBusy(true); try { const res = await fetch("/api/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }); const body = await res.json(); if (!res.ok) throw new Error(body.error?.message); router.push(`/songs/${body.song.id}`); } catch (e) { window.alert(e instanceof Error ? e.message : "Could not create song"); } finally { setBusy(false); } }}>＋ New song</button>;
}
