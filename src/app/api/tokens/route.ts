import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { requireSessionUser } from "@/lib/auth/guards";
import { ALL_SCOPES } from "@/lib/auth/scopes";
import { createToken, listTokens } from "@/lib/services/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createTokenSchema = z.object({
  name: z.string().max(100),
  scopes: z.array(z.enum(ALL_SCOPES)).min(1),
  expiresInDays: z
    .union([
      z.literal(1),
      z.literal(7),
      z.literal(30),
      z.literal(90),
      z.null(),
    ])
    .optional(),
});

export const GET = apiHandler(async (request) => {
  const context = await requireSessionUser(request);
  return Response.json({ tokens: await listTokens(context.userId) });
});

export const POST = apiHandler(async (request) => {
  const context = await requireSessionUser(request);
  const body = await parseJson(request, createTokenSchema);
  const result = await createToken(context.userId, body);

  return Response.json(result, { status: 201 });
});
