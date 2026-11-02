import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { AccessRequestForm } from "@/components/landing/AccessRequestForm";
import { LandingDemoLoader } from "@/components/landing/LandingDemoLoader";
import styles from "@/components/landing/landing.module.css";

export const metadata: Metadata = { title: "SongPad — Your writing room", description: "Write lyrics, keep your beats and record vocal takes in your own Google Drive.", alternates: { canonical: "/" }, openGraph: { title: "SongPad — Your writing room", description: "Write lyrics, keep your beats and record vocal takes in your own Google Drive.", url: "/", siteName: "SongPad", type: "website", images: ["/og.svg"] }, twitter: { card: "summary_large_image", title: "SongPad — Your writing room", description: "Write lyrics, keep your beats and record vocal takes in your own Google Drive.", images: ["/og.svg"] } };

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/songs");
  return <main className={styles.page}>
    <header className={styles.nav}><Link className={styles.brand} href="/">SongPad<span>♪</span></Link><nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/login">Sign in</Link></nav></header>
    <section className={styles.hero}><div className={styles.heroCopy}><p className={styles.kicker}>A calm place to make music</p><h1>Your next song starts here.</h1><p className={styles.lede}>Keep your lyrics, instrumentals and vocal takes together in a private writing room that uses your own Google Drive.</p><div className={styles.heroActions}><a className={styles.cta} href="#request-access">Request access</a><Link className={styles.signin} href="/login">Already invited? Sign in →</Link></div></div><div className={styles.heroArt} aria-hidden="true"><span>♫</span><div className={styles.waveDecor}>{Array.from({length:27},(_,i)=><i key={i} style={{"--bar":`${20+(i*31)%72}%`} as CSSProperties}/>)}</div><small>your words · your sound · your space</small></div></section>
    <div className={styles.demoWrap}><LandingDemoLoader/></div>
    <section className={styles.steps}><p className={styles.kicker}>A simple workflow</p><h2>Keep the writing moving.</h2><div className={styles.stepGrid}><article><span>01</span><h3>Add a beat</h3><p>Bring an instrumental into your own Drive and play it while you write.</p></article><article><span>02</span><h3>Write lyrics</h3><p>Keep verses and revisions alongside the beat that inspired them.</p></article><article><span>03</span><h3>Record takes</h3><p>Capture vocal ideas, listen back, rename favorites and keep going.</p></article></div></section>
    <section className={styles.privacyBand}><div><p className={styles.kicker}>Your audio stays yours</p><h2>Files stay in your Google Drive.</h2><p>SongPad requests Google’s <code>drive.file</code> access. That scope lets it create and manage files it creates or that you explicitly open with SongPad; it does not grant access to your whole Drive. The app’s database stores song titles, lyrics, file metadata and an encrypted Google access token.</p><Link href="/privacy">How your data is handled →</Link></div><div className={styles.driveArt} aria-hidden="true">♫<span>↗</span></div></section>
    <section className={styles.agents}><p className={styles.kicker}>For agents</p><h2>Make room for your creative tools.</h2><p>AI agents can work with your songbook through scoped, revocable access tokens. You choose which capabilities each token can use.</p></section>
    <section id="request-access" className={styles.request}><div><p className={styles.kicker}>Early access</p><h2>Want a place to write?</h2><p>Send a request and the owner will review it. SongPad is currently invite-only.</p></div><AccessRequestForm/></section>
    <footer className={styles.footer}><Link className={styles.brand} href="/">SongPad<span>♪</span></Link><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="mailto:CONTACT_EMAIL">Contact</a></div><small>© {new Date().getFullYear()} SongPad · Contact placeholder to be replaced by owner</small></footer>
  </main>;
}
