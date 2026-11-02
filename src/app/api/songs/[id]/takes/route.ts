import { apiHandler } from "@/lib/api/handler";
import { requireUser } from "@/lib/auth/guards";
import { listTakes } from "@/lib/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler<{ id: string }>(async (request, { params }) => {
  const context = await requireUser(request, { scope: "takes:read" });
  const { id } = await params;

  return Response.json({
    takes: await listTakes(context.userId, id),
  });
});
