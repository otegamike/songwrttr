import { apiHandler } from "@/lib/api/handler";
import { auditBearer } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/guards";
import { deleteInstrumental } from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = apiHandler<{ id: string }>(
  async (request, { params }) => {
    const context = await requireUser(request, { scope: "songs:delete" });
    const { id } = await params;
    await deleteInstrumental(context.userId, id);
    await auditBearer(context, "instrumental.delete", id);
    return new Response(null, { status: 204 });
  },
);
