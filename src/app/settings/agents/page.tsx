import type { Metadata } from "next";
import Link from "next/link";
import { TokenManager } from "@/components/settings/TokenManager";
import { requireSession } from "@/lib/auth/guards";
import { listTokens } from "@/lib/services/tokens";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Agent access",
};

export default async function AgentSettingsPage() {
  const session = await requireSession();
  const tokens = await listTokens(session.user.id);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Settings</p>
          <h1 className={styles.title}>Agent access</h1>
        </div>
        <Link className={styles.back} href="/songs">
          Back to songs
        </Link>
      </header>

      <p className={styles.intro}>
        Personal access tokens let scripts and MCP clients call the SongPad API.
        Treat them like passwords and revoke anything you no longer use.
      </p>

      <TokenManager initialTokens={tokens} />
    </main>
  );
}
