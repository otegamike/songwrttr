import "server-only";
import { User } from "@/models/User";
import { createDriveProvider } from "./drive";
import { createGoogleTokenService } from "./token";

const tokenService = createGoogleTokenService({
  store: {
    async get(userId) {
      const user = await User.findById(userId)
        .select("encryptedRefreshToken driveReconnectRequired")
        .lean();

      if (!user) return null;

      return {
        encryptedRefreshToken: user.encryptedRefreshToken ?? null,
        driveReconnectRequired: Boolean(user.driveReconnectRequired),
      };
    },
    async markReconnectRequired(userId) {
      await User.updateOne(
        { _id: userId },
        {
          $set: {
            driveReconnectRequired: true,
            driveReconnectAt: new Date(),
          },
        },
      );
    },
  },
});

export const storage = createDriveProvider({
  getAccessToken: tokenService.getAccessToken,
  revokeAccess: tokenService.revokeAccess,
  userRepo: {
    async getDriveRootFolderId(userId) {
      const user = await User.findById(userId)
        .select("driveRootFolderId")
        .lean();
      return user?.driveRootFolderId ?? null;
    },
    async setDriveRootFolderId(userId, folderId) {
      await User.updateOne(
        { _id: userId },
        { $set: { driveRootFolderId: folderId } },
      );
    },
  },
});

export type { StorageProvider } from "./types";
