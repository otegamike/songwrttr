"use client";
import { signOut } from "next-auth/react";
import { useState } from "react";
import styles from "./page.module.css";
export function DeleteAccountForm() {
  const [confirmation, setConfirmation] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <form onSubmit={async (event) => { event.preventDefault(); if (confirmation !== "DELETE") return; setBusy(true); setError(""); try { const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) }); if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message ?? "Account deletion failed."); } await signOut({ callbackUrl: "/" }); } catch (caught) { setError(caught instanceof Error ? caught.message : "Account deletion failed."); setBusy(false); } }}>
    <label htmlFor="delete-confirmation">Type DELETE to confirm</label><input id="delete-confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off"/><button className={styles.danger} type="submit" disabled={confirmation !== "DELETE" || busy}>{busy ? "Deleting…" : "Delete my account"}</button>{error && <p role="alert">{error}</p>}
  </form>;
}
