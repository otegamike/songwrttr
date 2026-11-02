import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { requireUser } from "@/lib/auth/guards";
import { getOwnedMediaKind, streamMedia } from "@/lib/services/media";

async function authorizeAndStream(request: Request, driveFileId: string, method: "GET" | "HEAD") {
  const context = await requireUser(request);
  const kind = await getOwnedMediaKind(context.userId, driveFileId);
  if (!kind) {
    throw new ApiError("NOT_FOUND", "Media not found");
  }
  const required = kind === "instrumental" ? "songs:read" : "takes:read";
  if (!context.scopes.includes(required)) {
    throw new ApiError("FORBIDDEN", `This credential requires ${required}`);
  }
  return streamMedia(context.userId, driveFileId, request.headers.get("range"), method);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler<{ driveFileId: string }>(
  async (request, { params }) => {
    const { driveFileId } = await params;
    return authorizeAndStream(request, driveFileId, "GET");
  },
);

export const HEAD = apiHandler<{ driveFileId: string }>(
  async (request, { params }) => {
    const { driveFileId } = await params;
    return authorizeAndStream(request, driveFileId, "HEAD");
  },
);
