import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { getSong } from "@/lib/services/songs";
import { getEnv } from "@/lib/config/env";
import { SongWorkspace } from "./SongWorkspace";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  let song;
  try { song = await getSong(session.user.id, id); }
  catch { notFound(); }
  return <SongWorkspace initialSong={song} maxTakeMb={getEnv().MAX_TAKE_MB}/>;
}
