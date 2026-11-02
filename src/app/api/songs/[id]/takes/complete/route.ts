import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { auditBearer } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/guards";
import { completeTake } from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  uploadId: z.string().min(1),
  driveFileId: z.string().min(1),
  durationMs: z.number().int().min(0),
  name: z.string().max(100).optional(),
});

export const POST = apiHandler<{ id: string }>(async (request, { params }) => {
  const context = await requireUser(request, { scope: "media:write" });
  const { id } = await params;
  const body = await parseJson(request, schema);
  const take = await completeTake(context.userId, id, body);
  await auditBearer(context, "take.complete", take.id);

  return Response.json({ take });
});
