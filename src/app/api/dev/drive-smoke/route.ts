import { ApiError } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { requireUser } from "@/lib/auth/guards";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async (request) => {
  if (process.env.NODE_ENV === "production") {
    throw new ApiError("NOT_FOUND", "Not found");
  }

  const { userId } = await requireUser(request);
  const rootFolderId = await storage.ensureRootFolder(userId);

  const session = await storage.createUploadSession(userId, {
    folderId: rootFolderId,
    fileName: "songpad-smoke-test.mp3",
    mimeType: "audio/mpeg",
    size: 1024,
    origin: request.headers.get("origin") ?? undefined,
  });

  return Response.json({
    rootFolderId,
    uploadUrl: session.uploadUrl,
    expiresAt: session.expiresAt,
  });
});
