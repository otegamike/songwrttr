import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { requireSession } from "@/lib/auth/guards";
import { getEnv } from "@/lib/config/env";
import { SongBrowser, NewSongButton } from "./SongBrowser";
import styles from "./songs.module.css";

export const metadata: Metadata = { title: "Songs" };

export default async function SongsPage() {
  const session = await requireSession();
  const isAdmin = (session.user.email ?? "").toLowerCase() === getEnv().ADMIN_EMAIL.toLowerCase();
  return <main className={styles.main}>
    <header className={styles.header}><div><p className={styles.eyebrow}>SongPad</p><h1 className={styles.title}>Songs</h1><p className={styles.meta}>Your writing room, {session.user.name?.split(" ")[0] ?? ""}</p></div><div className={styles.actions}><NewSongButton/><Link className={styles.link} href="/settings/agents">Agent settings</Link><Link className={styles.link} href="/settings/account">Account</Link>{isAdmin && <Link className={styles.link} href="/admin/invites">Invites</Link>}<SignOutButton/></div></header>
    <Suspense fallback={<p className={styles.state}>Loading songs…</p>}><SongBrowser/></Suspense>
  </main>;
}
