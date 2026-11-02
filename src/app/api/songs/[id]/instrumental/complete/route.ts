import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { auditBearer } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/guards";
import { completeInstrumental } from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  uploadId: z.string().min(1),
  driveFileId: z.string().min(1),
});

export const POST = apiHandler<{ id: string }>(async (request, { params }) => {
  const context = await requireUser(request, { scope: "media:write" });
  const { id } = await params;
  const body = await parseJson(request, schema);
  const song = await completeInstrumental(context.userId, id, body);
  await auditBearer(context, "instrumental.complete", id);

  return Response.json({ song });
});
