"use client";

import { useState, type FormEvent } from "react";
import type { Scope } from "@/lib/auth/scopes";
import type { TokenSummary } from "@/types/tokens";
import styles from "./TokenManager.module.css";

interface TokenManagerProps {
  initialTokens: TokenSummary[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

const SCOPES: {
  value: Scope;
  label: string;
  description: string;
  dangerous?: boolean;
}[] = [
  {
    value: "songs:read",
    label: "Read songs",
    description: "List songs, read lyrics and search your songbook.",
  },
  {
    value: "songs:write",
    label: "Write songs",
    description: "Create songs and edit titles or lyrics.",
  },
  {
    value: "media:write",
    label: "Upload media",
    description: "Request upload sessions and finish instrumental or take uploads.",
  },
  {
    value: "takes:read",
    label: "Listen to takes",
    description: "List and stream recorded takes.",
  },
  {
    value: "songs:delete",
    label: "Delete permanently",
    description: "Delete songs, instrumentals and takes. This cannot be undone.",
    dangerous: true,
  },
];

const DEFAULT_SCOPES: Scope[] = [
  "songs:read",
  "songs:write",
  "media:write",
  "takes:read",
];

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
  return body.error?.message ?? "Request failed";
}

function formatDate(value: string | null): string {
  if (!value) return "never";
  return value.slice(0, 10);
}

export function TokenManager({ initialTokens }: TokenManagerProps) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Scope[]>(DEFAULT_SCOPES);
  const [expiry, setExpiry] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleScope(scope: Scope) {
    setSelected((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    setCopied(false);

    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: selected,
          expiresInDays: expiry === "never" ? null : Number(expiry),
        }),
      });

      if (!response.ok) throw new Error(await readError(response));

      const data = (await response.json()) as {
        token: string;
        apiToken: TokenSummary;
      };

      setTokens((current) => [data.apiToken, ...current]);
      setCreatedToken(data.token);
      setName("");
      setSelected(DEFAULT_SCOPES);
      setExpiry("30");
      setStatus("Token created. Copy it now.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!createdToken) return;

    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the token and copy it.");
    }
  }

  async function handleRevoke(id: string) {
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`/api/tokens/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(await readError(response));

      const data = (await response.json()) as { apiToken: TokenSummary };
      setTokens((current) =>
        current.map((token) =>
          token.id === data.apiToken.id ? data.apiToken : token,
        ),
      );
      setStatus(`Revoked ${data.apiToken.name}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {createdToken ? (
        <section className={styles.tokenDialog} role="alertdialog">
          <h2 className={styles.cardTitle}>Copy your token now</h2>
          <p className={styles.warning}>
            You will not see this token again. Store it somewhere safe before
            closing this message.
          </p>
          <code className={styles.tokenValue}>{createdToken}</code>
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void handleCopy()}
            >
              {copied ? "Copied" : "Copy token"}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setCreatedToken(null);
                setCopied(false);
              }}
            >
              I stored it
            </button>
          </div>
        </section>
      ) : null}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Create a token</h2>
        <form className={styles.form} onSubmit={handleCreate}>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Claude desktop"
            />
          </label>

          <fieldset className={styles.scopes}>
            <legend className={styles.label}>Scopes</legend>
            {SCOPES.map((scope) => (
              <label
                key={scope.value}
                className={
                  scope.dangerous
                    ? `${styles.scope} ${styles.dangerScope}`
                    : styles.scope
                }
              >
                <input
                  type="checkbox"
                  checked={selected.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                />
                <span>
                  <strong>{scope.label}</strong>
                  <span className={styles.scopeDescription}>
                    {scope.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className={styles.field}>
            <span className={styles.label}>Expiry</span>
            <select
              className={styles.input}
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            >
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="never">Never</option>
            </select>
          </label>

          <button
            className={styles.primary}
            type="submit"
            disabled={busy || selected.length === 0}
          >
            {busy ? "Working…" : "Create token"}
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
        <h2 className={styles.cardTitle}>Your tokens</h2>
        {tokens.length === 0 ? (
          <p className={styles.empty}>No tokens yet.</p>
        ) : (
          <ul className={styles.list}>
            {tokens.map((token) => (
              <li key={token.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.tokenName}>{token.name}</span>
                  <span className={styles.prefix}>{token.prefix}…</span>
                  <span className={styles.meta}>
                    {token.scopes.join(", ")} · created{" "}
                    {formatDate(token.createdAt)} · last used{" "}
                    {formatDate(token.lastUsedAt)} · expires{" "}
                    {formatDate(token.expiresAt)}
                  </span>
                </div>
                {token.revokedAt ? (
                  <span className={styles.revoked}>Revoked</span>
                ) : (
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy}
                    onClick={() => void handleRevoke(token.id)}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
