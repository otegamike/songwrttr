import "server-only";
import { ApiError } from "@/lib/api/errors";
import { getEnv } from "@/lib/config/env";
import { AllowedEmail } from "@/models/AllowedEmail";
import { AccessRequest } from "@/models/AccessRequest";
import type {
  AccessRequestSummary,
  InviteSummary,
} from "@/types/invites";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toInvite(doc: {
  email: string;
  note?: string | null;
  status: "active" | "revoked";
  createdAt: Date;
}): InviteSummary {
  return {
    email: doc.email,
    note: doc.note ?? null,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}

function toRequest(doc: {
  email: string;
  message?: string | null;
  status: "new" | "approved" | "dismissed";
  createdAt: Date;
}): AccessRequestSummary {
  return {
    email: doc.email,
    message: doc.message ?? null,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function listInvites(): Promise<{
  invites: InviteSummary[];
  requests: AccessRequestSummary[];
}> {
  const [invites, requests] = await Promise.all([
    AllowedEmail.find().sort({ email: 1 }).lean(),
    AccessRequest.find().sort({ createdAt: -1 }).lean(),
  ]);

  return {
    invites: invites.map(toInvite),
    requests: requests.map(toRequest),
  };
}

export async function addInvite(
  email: string,
  note?: string,
): Promise<InviteSummary> {
  const normalized = normalizeEmail(email);

  await AllowedEmail.updateOne(
    { email: normalized },
    {
      $set: {
        status: "active",
        ...(note !== undefined ? { note } : {}),
      },
      $setOnInsert: { email: normalized },
    },
    { upsert: true },
  );

  const doc = await AllowedEmail.findOne({ email: normalized }).lean();
  if (!doc) {
    throw new ApiError("INTERNAL", "Could not save invite");
  }

  return toInvite(doc);
}

export async function revokeInvite(email: string): Promise<InviteSummary> {
  const normalized = normalizeEmail(email);

  if (normalized === getEnv().ADMIN_EMAIL.toLowerCase()) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "The admin email cannot be revoked",
    );
  }

  const doc = await AllowedEmail.findOneAndUpdate(
    { email: normalized },
    { $set: { status: "revoked" } },
    { new: true },
  ).lean();

  if (!doc) {
    throw new ApiError("NOT_FOUND", "Invite not found");
  }

  return toInvite(doc);
}

export async function reviewAccessRequest(email: string, decision: "approve" | "dismiss"): Promise<{ request: AccessRequestSummary; invite?: InviteSummary }> {
  const normalized = normalizeEmail(email);
  const found = await AccessRequest.findOne({ email: normalized }).lean();
  if (!found) throw new ApiError("NOT_FOUND", "Access request not found");
  const invite = decision === "approve" ? await addInvite(normalized, "Approved access request") : undefined;
  const doc = await AccessRequest.findOneAndUpdate({ email: normalized }, { $set: { status: decision === "approve" ? "approved" : "dismissed" } }, { new: true }).lean();
  if (!doc) throw new ApiError("NOT_FOUND", "Access request not found");
  return { request: toRequest(doc), ...(invite ? { invite } : {}) };
}
