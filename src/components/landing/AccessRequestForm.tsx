"use client";
import { useState, type FormEvent } from "react";
import styles from "./landing.module.css";
export function AccessRequestForm() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [website, setWebsite] = useState(""); const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <form className={styles.requestForm} onSubmit={async (event: FormEvent) => { event.preventDefault(); setBusy(true); setStatus(""); setError(""); try { const response = await fetch("/api/access-requests", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,message,website}) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error?.message ?? "Could not send your request."); setStatus(body.message); setEmail(""); setMessage(""); } catch (e) { setError(e instanceof Error ? e.message : "Could not send your request."); } finally { setBusy(false); } }}>
    <label>Email<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label>
    <label>What would you like to use SongPad for? <span>(optional)</span><textarea maxLength={1000} rows={3} value={message} onChange={(e) => setMessage(e.target.value)}/></label>
    <label className={styles.honeypot} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)}/></label>
    <button type="submit" disabled={busy}>{busy ? "Sending…" : "Request access"}</button>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </form>;
}
