"use client";

export interface PendingTake {
  id: string;
  songId: string;
  name: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: number;
}

const DB_NAME = "songpad-pending-takes-v1";
const STORE_NAME = "pending";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  if (!dbPromise) dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE_NAME)) { const store = db.createObjectStore(STORE_NAME, { keyPath: "id" }); store.createIndex("songId", "songId"); store.createIndex("createdAt", "createdAt"); } };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open pending-takes storage"));
  }).catch((error) => { dbPromise = null; throw error; });
  return dbPromise;
}

export async function savePendingTake(input: Omit<PendingTake, "id" | "createdAt">): Promise<PendingTake> {
  const pending = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(pending); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  return pending;
}

export async function listPendingTakes(songId: string): Promise<PendingTake[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).index("songId").getAll(IDBKeyRange.only(songId)); request.onsuccess = () => resolve((request.result as PendingTake[]).sort((a, b) => b.createdAt - a.createdAt)); request.onerror = () => reject(request.error); });
}

export async function deletePendingTake(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}
