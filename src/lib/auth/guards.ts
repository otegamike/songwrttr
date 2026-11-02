import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/origin";
import { getEnv } from "@/lib/config/env";
import { connectDb } from "@/lib/db/connect";
import { enforceTokenRateLimit } from "@/lib/rate-limit/tokenLimiter";
import { resolveBearerAuth } from "./bearer";
import { authOptions } from "./options";
import { ALL_SCOPES, type Scope } from "./scopes";
import type { AuthContext } from "./types";

function isMutating(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export async function requireUser(
  request: Request,
  options: { scope?: Scope } = {},
): Promise<AuthContext> {
  const session = await getServerSession(authOptions);

  let context: AuthContext | null = null;

  if (session?.user?.id) {
    await connectDb();
    context = {
      userId: session.user.id,
      email: session.user.email ?? "",
      via: "session",
      scopes: [...ALL_SCOPES],
    };

    if (isMutating(request.method)) {
      assertSameOrigin(request);
    }
  } else {
    context = await resolveBearerAuth(request);
  }

  if (!context) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required");
  }

  if (context.via === "bearer") {
    await enforceTokenRateLimit(context.tokenId);
  }

  if (options.scope && !context.scopes.includes(options.scope)) {
    throw new ApiError(
      "FORBIDDEN",
      "This credential does not have the required scope",
    );
  }

  return context;
}

export async function requireSessionUser(
  request: Request,
): Promise<AuthContext> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required");
  }

  await connectDb();

  if (isMutating(request.method)) {
    assertSameOrigin(request);
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    via: "session",
    scopes: [...ALL_SCOPES],
  };
}

export function requireAdmin(context: AuthContext): void {
  const isAdmin =
    context.via === "session" &&
    context.email.toLowerCase() === getEnv().ADMIN_EMAIL.toLowerCase();

  if (!isAdmin) {
    throw new ApiError("FORBIDDEN", "Admin access required");
  }
}

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  await connectDb();
  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();
  const email = (session.user.email ?? "").toLowerCase();

  if (email !== getEnv().ADMIN_EMAIL.toLowerCase()) {
    redirect("/songs");
  }

  return session;
}
