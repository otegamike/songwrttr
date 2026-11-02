import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { SignInButton } from "@/components/auth/SignInButton";
import { authOptions } from "@/lib/auth/options";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; reconsent?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/songs");

  const params = await searchParams;
  const notInvited = params.error === "NotInvited";
  const reconsent = params.reconsent === "1";

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>SongPad</p>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>
          Write lyrics, keep your beats and record takes.
        </p>

        {notInvited ? (
          <p role="alert" className={styles.error}>
            This Google account is not on the invite list. Ask the owner to add
            you.
          </p>
        ) : null}

        {reconsent ? (
          <p role="status" className={styles.notice}>
            We need permission to keep a Google Drive refresh token. Continue to
            grant access.
          </p>
        ) : null}

        <SignInButton promptConsent={reconsent} />

        <p className={styles.fineprint}>
          Audio stays in your own Google Drive. SongPad can manage files it
          creates and files you explicitly open with it. <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
        </p>
      </section>
    </main>
  );
}
