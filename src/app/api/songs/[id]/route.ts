import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { auditBearer } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/guards";
import {
  deleteSong,
  getSong,
  updateSong,
} from "@/lib/services/songs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSongSchema = z
  .object({
    title: z.string().optional(),
    lyricsJson: z.unknown().optional(),
    lyricsPlain: z.string().max(200_000).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.lyricsJson !== undefined ||
      value.lyricsPlain !== undefined,
    { message: "No changes supplied" },
  )
  .refine(
    (value) =>
      value.lyricsJson === undefined || value.lyricsPlain === undefined,
    { message: "Provide either lyricsJson or lyricsPlain, not both" },
  );

export const GET = apiHandler<{ id: string }>(async (request, { params }) => {
  const context = await requireUser(request, { scope: "songs:read" });
  const { id } = await params;
  return Response.json({ song: await getSong(context.userId, id) });
});

export const PATCH = apiHandler<{ id: string }>(
  async (request, { params }) => {
    const context = await requireUser(request, { scope: "songs:write" });
    const { id } = await params;
    const body = await parseJson(request, updateSongSchema);
    const song = await updateSong(context.userId, id, body);
    await auditBearer(context, "song.update", id);

    return Response.json({ song });
  },
);

export const DELETE = apiHandler<{ id: string }>(
  async (request, { params }) => {
    const context = await requireUser(request, { scope: "songs:delete" });
    const { id } = await params;
    await deleteSong(context.userId, id);
    await auditBearer(context, "song.delete", id);
    return new Response(null, { status: 204 });
  },
);
