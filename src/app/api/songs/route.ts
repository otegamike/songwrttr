import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson, parseQuery } from "@/lib/api/request";
import { auditBearer } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/guards";
import { createSong, listSongs } from "@/lib/services/songs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSongSchema = z
  .object({
    title: z.string(),
    lyricsJson: z.unknown().optional(),
    lyricsPlain: z.string().max(200_000).optional(),
    importKey: z.string().max(200).optional(),
  })
  .refine(
    (value) =>
      value.lyricsJson === undefined || value.lyricsPlain === undefined,
    { message: "Provide either lyricsJson or lyricsPlain, not both" },
  );

const listSongsSchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const GET = apiHandler(async (request) => {
  const context = await requireUser(request, { scope: "songs:read" });
  const query = parseQuery(request, listSongsSchema);
  const result = await listSongs(context.userId, query);
  return Response.json(result);
});

export const POST = apiHandler(async (request) => {
  const context = await requireUser(request, { scope: "songs:write" });
  const body = await parseJson(request, createSongSchema);
  const result = await createSong(context.userId, body);
  await auditBearer(context, "song.create", result.song.id);

  return Response.json(result, { status: result.created ? 201 : 200 });
});
