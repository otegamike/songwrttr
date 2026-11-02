import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { auditBearer } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/guards";
import { deleteTake, renameTake } from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().max(100),
});

export const PATCH = apiHandler<{ takeId: string }>(
  async (request, { params }) => {
    const context = await requireUser(request, { scope: "songs:write" });
    const { takeId } = await params;
    const body = await parseJson(request, schema);
    const take = await renameTake(context.userId, takeId, body.name);
    await auditBearer(context, "take.update", takeId);

    return Response.json({ take });
  },
);

export const DELETE = apiHandler<{ takeId: string }>(
  async (request, { params }) => {
    const context = await requireUser(request, { scope: "songs:delete" });
    const { takeId } = await params;
    await deleteTake(context.userId, takeId);
    await auditBearer(context, "take.delete", takeId);
    return new Response(null, { status: 204 });
  },
);
