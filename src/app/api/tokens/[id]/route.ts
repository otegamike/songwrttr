import { apiHandler } from "@/lib/api/handler";
import { requireSessionUser } from "@/lib/auth/guards";
import { revokeToken } from "@/lib/services/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = apiHandler<{ id: string }>(
  async (request, { params }) => {
    const context = await requireSessionUser(request);
    const { id } = await params;

    return Response.json({
      apiToken: await revokeToken(context.userId, id),
    });
  },
);
