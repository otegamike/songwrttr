import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/guards";
import { DeleteAccountForm } from "./DeleteAccountForm";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Account" };
export default async function AccountPage() {
  await requireSession();
  return <main className={styles.main}><header><p className={styles.eyebrow}>Settings</p><h1>Account</h1><Link href="/songs">Back to songs</Link></header><section className={styles.card}><h2>Delete account</h2><p>This permanently deletes your SongPad songs, lyrics, takes, tokens and app data. Files in your Google Drive are left untouched.</p><DeleteAccountForm/></section></main>;
}
