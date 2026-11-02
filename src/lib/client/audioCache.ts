"use client";

type AudioEntry = { key: string; fileId: string; blob: Blob; size: number; lastAccessedAt: number };
const DB = "songpad-audio-v1";
const STORE = "audio";
let cacheCap = 500 * 1024 * 1024;
let accessSequence = Date.now();
let dbPromise: Promise<IDBDatabase> | null = null;
let persistAsked = false;

function openDb(): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis)) return Promise.reject(new Error("IndexedDB unavailable"));
  if (!persistAsked) { persistAsked = true; void navigator.storage?.persist?.().catch(() => false); }
  if (!dbPromise) dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) { const store = db.createObjectStore(STORE, { keyPath: "key" }); store.createIndex("lastAccessedAt", "lastAccessedAt"); store.createIndex("fileId", "fileId"); } };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open cache"));
  }).catch((error): never => { dbPromise = null; throw error; });
  return dbPromise as Promise<IDBDatabase>;
}
function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => { const tx = db.transaction(STORE, mode); run(tx.objectStore(STORE), resolve, reject); tx.onerror = () => reject(tx.error); }));
}
async function read(key: string): Promise<AudioEntry | null> { return transaction("readonly", (store, resolve, reject) => { const req = store.get(key); req.onsuccess = () => resolve(req.result ?? null); req.onerror = () => reject(req.error); }); }
async function write(entry: AudioEntry): Promise<void> { await transaction<void>("readwrite", (store, resolve, reject) => { const req = store.put(entry); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }

export async function getAudioUrl(fileId: string, md5: string, onProgress?: (loaded: number, total: number) => void): Promise<string> {
  const key = `${fileId}:${md5}`;
  const mediaUrl = `/api/media/${encodeURIComponent(fileId)}`;
  try { await openDb(); } catch { return mediaUrl; }
  let cached: AudioEntry | null;
  try { cached = await read(key); } catch { return mediaUrl; }
  if (cached) { cached.lastAccessedAt = ++accessSequence; await write(cached).catch(() => undefined); return URL.createObjectURL(cached.blob); }
  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) throw Object.assign(new Error("Could not load instrumental"), { status: response.status, body: await response.json().catch(() => null) });
    const total = Number(response.headers.get("content-length")) || 0;
    let blob: Blob;
    if (response.body && total && onProgress) {
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let loaded = 0;
      while (true) { const result = await reader.read(); if (result.done) break; chunks.push(result.value); loaded += result.value.length; onProgress(loaded, total); }
      blob = new Blob(chunks.map((chunk) => chunk.slice().buffer as ArrayBuffer), { type: response.headers.get("content-type") ?? "audio/mpeg" });
    } else { blob = await response.blob(); }
    if (blob.size > cacheCap) return mediaUrl;
    try { await write({ key, fileId, blob, size: blob.size, lastAccessedAt: ++accessSequence }); await evictToCap(); } catch { return mediaUrl; }
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    return mediaUrl;
  }
}
async function evictToCap() {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const all = store.getAll(); all.onsuccess = () => { const rows = (all.result as AudioEntry[]).sort((a,b) => a.lastAccessedAt - b.lastAccessedAt); let size = rows.reduce((n,row) => n + row.size, 0); for (const row of rows) { if (size <= cacheCap) break; store.delete(row.key); size -= row.size; } resolve(); }; all.onerror = () => reject(all.error);
  });
}
export async function cacheAudioBlob(fileId: string, md5: string, blob: Blob): Promise<void> {
  await write({ key: `${fileId}:${md5}`, fileId, blob, size: blob.size, lastAccessedAt: ++accessSequence });
  await evictToCap();
}
export function configureAudioCache(options: { maxBytes?: number }) {
  if (options.maxBytes !== undefined && Number.isFinite(options.maxBytes) && options.maxBytes >= 0) cacheCap = options.maxBytes;
}
export async function evict(fileId: string) { await transaction<void>("readwrite", (store, resolve, reject) => { const req = store.index("fileId").openCursor(IDBKeyRange.only(fileId)); req.onsuccess = () => { const cursor = req.result; if (cursor) { cursor.delete(); cursor.continue(); } else resolve(); }; req.onerror = () => reject(req.error); }).catch(() => undefined); }
export async function clear() { await transaction<void>("readwrite", (store, resolve, reject) => { const req = store.clear(); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); }
