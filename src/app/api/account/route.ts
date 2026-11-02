import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { requireSessionUser } from "@/lib/auth/guards";
import { deleteAccount } from "@/lib/services/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ confirmation: z.literal("DELETE") });

export const DELETE = apiHandler(async (request) => {
  const context = await requireSessionUser(request);
  await parseJson(request, schema);
  await deleteAccount(context.userId);
  return Response.json({ ok: true, driveFilesKept: true });
});
