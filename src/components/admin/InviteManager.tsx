"use client";

import { useState, type FormEvent } from "react";
import type {
  AccessRequestSummary,
  InviteSummary,
} from "@/types/invites";
import styles from "./InviteManager.module.css";

interface InviteManagerProps {
  initialInvites: InviteSummary[];
  initialRequests: AccessRequestSummary[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
  return body.error?.message ?? "Request failed";
}

export function InviteManager({
  initialInvites,
  initialRequests,
}: InviteManagerProps) {
  const [invites, setInvites] = useState(initialInvites);
  const [requests, setRequests] = useState(initialRequests);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });

      if (!response.ok) throw new Error(await readError(response));

      const data = (await response.json()) as { invite: InviteSummary };
      setInvites((current) => {
        const next = current.filter(
          (item) => item.email !== data.invite.email,
        );
        return [...next, data.invite].sort((a, b) =>
          a.email.localeCompare(b.email),
        );
      });
      setEmail("");
      setNote("");
      setStatus(`Invited ${data.invite.email}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(target: string) {
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/admin/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });

      if (!response.ok) throw new Error(await readError(response));

      const data = (await response.json()) as { invite: InviteSummary };
      setInvites((current) =>
        current.map((item) =>
          item.email === data.invite.email ? data.invite : item,
        ),
      );
      setStatus(`Revoked ${data.invite.email}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestReview(target: string, decision: "approve" | "dismiss") {
    setBusy(true); setError(null); setStatus(null);
    try {
      const response = await fetch("/api/admin/invites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: target, decision }) });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as { request: AccessRequestSummary; invite?: InviteSummary };
      setRequests((current) => current.map((item) => item.email === data.request.email ? data.request : item));
      if (data.invite) setInvites((current) => [...current.filter((item) => item.email !== data.invite!.email), data.invite!].sort((a,b) => a.email.localeCompare(b.email)));
      setStatus(decision === "approve" ? `Approved ${target}` : `Dismissed ${target}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Request failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Invite someone</h2>
        <form className={styles.form} onSubmit={handleAdd}>
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              className={styles.input}
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="friend@example.com"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Note (optional)</span>
            <input
              className={styles.input}
              type="text"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Who is this?"
            />
          </label>
          <button className={styles.primary} type="submit" disabled={busy}>
            {busy ? "Working…" : "Add invite"}
          </button>
        </form>

        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        {status ? (
          <p role="status" className={styles.status}>
            {status}
          </p>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Allowed emails</h2>
        {invites.length === 0 ? (
          <p className={styles.empty}>No invites yet.</p>
        ) : (
          <ul className={styles.list}>
            {invites.map((invite) => (
              <li key={invite.email} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.email}>{invite.email}</span>
                  <span className={styles.meta}>
                    {invite.note ? `${invite.note} · ` : ""}
                    {invite.status}
                  </span>
                </div>
                {invite.status === "active" ? (
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy}
                    onClick={() => void handleRevoke(invite.email)}
                  >
                    Revoke
                  </button>
                ) : (
                  <span className={styles.revoked}>Revoked</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Access requests</h2>
        {requests.length === 0 ? (
          <p className={styles.empty}>
            No access requests yet.
          </p>
        ) : (
          <ul className={styles.list}>
            {requests.map((request) => (
              <li key={`${request.email}-${request.createdAt}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.email}>{request.email}</span>
                  <span className={styles.meta}>
                    {request.status}
                    {request.message ? ` · ${request.message}` : ""}
                  </span>
                </div>
                {request.status === "new" ? <div className={styles.rowActions}><button type="button" disabled={busy} onClick={() => void handleRequestReview(request.email, "approve")}>Approve</button><button type="button" className={styles.danger} disabled={busy} onClick={() => void handleRequestReview(request.email, "dismiss")}>Dismiss</button></div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
