import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { parseJson } from "@/lib/api/request";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import {
  addInvite,
  listInvites,
  reviewAccessRequest,
  revokeInvite,
} from "@/lib/services/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const addSchema = z.object({
  email: emailSchema,
  note: z.string().trim().max(200).optional(),
});

const removeSchema = z.object({
  email: emailSchema,
});
const reviewSchema = z.object({ email: emailSchema, decision: z.enum(["approve", "dismiss"]) });

export const GET = apiHandler(async (request) => {
  const context = await requireUser(request);
  requireAdmin(context);
  return Response.json(await listInvites());
});

export const POST = apiHandler(async (request) => {
  const context = await requireUser(request);
  requireAdmin(context);

  const body = await parseJson(request, addSchema);
  const invite = await addInvite(body.email, body.note);

  return Response.json({ invite }, { status: 201 });
});

export const DELETE = apiHandler(async (request) => {
  const context = await requireUser(request);
  requireAdmin(context);

  const body = await parseJson(request, removeSchema);
  const invite = await revokeInvite(body.email);

  return Response.json({ invite });
});

export const PATCH = apiHandler(async (request) => {
  const context = await requireUser(request);
  requireAdmin(context);
  const body = await parseJson(request, reviewSchema);
  return Response.json(await reviewAccessRequest(body.email, body.decision));
});
