import type { Metadata } from "next";
import Link from "next/link";
import { InviteManager } from "@/components/admin/InviteManager";
import { requireAdminSession } from "@/lib/auth/guards";
import { listInvites } from "@/lib/services/invites";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Invites",
};

export default async function AdminInvitesPage() {
  await requireAdminSession();
  const data = await listInvites();

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.title}>Invites</h1>
        </div>
        <Link className={styles.back} href="/songs">
          Back to songs
        </Link>
      </header>

      <InviteManager
        initialInvites={data.invites}
        initialRequests={data.requests}
      />
    </main>
  );
}
