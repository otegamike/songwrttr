import "server-only";
import type { AuthContext } from "@/lib/auth/types";
import { AuditLog } from "@/models/AuditLog";

export async function auditBearer(
  context: AuthContext,
  action: string,
  targetId: string,
): Promise<void> {
  if (context.via !== "bearer") return;

  try {
    await AuditLog.create({
      userId: context.userId,
      tokenId: context.tokenId,
      action,
      targetId,
      at: new Date(),
    });
  } catch {
    console.error("[audit] could not write audit entry", { action });
  }
}
