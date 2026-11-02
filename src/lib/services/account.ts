import "server-only";
import { connectDb } from "@/lib/db/connect";
import { storage } from "@/lib/storage";
import { User } from "@/models/User";
import { Song } from "@/models/Song";
import { Take } from "@/models/Take";
import { ApiToken } from "@/models/ApiToken";
import { UploadSession } from "@/models/UploadSession";
import { AuditLog } from "@/models/AuditLog";
import { RateLimit } from "@/models/RateLimit";
import { StorageError } from "@/lib/storage/errors";

export async function deleteAccount(userId: string): Promise<void> {
  await connectDb();
  const user = await User.findById(userId).select("encryptedRefreshToken driveReconnectRequired").lean();
  if (!user) return;
  if (user.encryptedRefreshToken && !user.driveReconnectRequired) {
    try { await storage.revokeAccess(userId); }
    catch (error) {
      if (!(error instanceof StorageError && error.code === "DRIVE_RECONNECT_REQUIRED")) throw error;
    }
  }
  const tokens = await ApiToken.find({ userId }).select("_id").lean();
  const tokenIds = tokens.map((token) => String(token._id));
  await Promise.all([
    Song.deleteMany({ userId }),
    Take.deleteMany({ userId }),
    UploadSession.deleteMany({ userId }),
    ApiToken.deleteMany({ userId }),
    AuditLog.deleteMany({ userId }),
    RateLimit.deleteMany({ key: { $in: [...tokenIds, `song-create:${userId}`, `upload-session:${userId}`] } }),
  ]);
  await User.deleteOne({ _id: userId });
}
