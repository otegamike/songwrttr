import { createHash } from "node:crypto";
import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { enforceWindowLimit } from "@/lib/rate-limit/window";
import { AccessRequest } from "@/models/AccessRequest";
import { AllowedEmail } from "@/models/AllowedEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), message: z.string().trim().max(1000).optional(), website: z.string().max(200).optional() });
const success = { ok: true, message: "If this address can request access, we’ll be in touch." };

export const POST = apiHandler(async (request) => {
  const body = await parseJson(request, schema);
  if (body.website?.trim()) return Response.json(success, { status: 202 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const key = createHash("sha256").update(ip).digest("hex");
  await enforceWindowLimit(`public-access:${key}`, 5, 60 * 60 * 1000);
  const alreadyAllowed = await AllowedEmail.exists({ email: body.email, status: "active" });
  if (!alreadyAllowed) {
    await AccessRequest.updateOne({ email: body.email }, { $setOnInsert: { email: body.email, status: "new", ...(body.message ? { message: body.message } : {}) } }, { upsert: true });
  }
  return Response.json(success, { status: 202 });
});
