import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { auditBearer } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/guards";
import { startUpload } from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  fileName: z.string().max(255),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
});

export const POST = apiHandler<{ id: string }>(async (request, { params }) => {
  const context = await requireUser(request, { scope: "media:write" });
  const { id } = await params;
  const body = await parseJson(request, schema);
  const origin = request.headers.get("origin") ?? undefined;

  const session = await startUpload(
    context.userId,
    id,
    "take",
    body,
    origin,
  );
  await auditBearer(context, "take.upload_session", id);

  return Response.json(session, { status: 201 });
});
