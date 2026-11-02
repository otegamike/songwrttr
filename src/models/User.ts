import { Schema, model, models, type Model } from "mongoose";

export interface EncryptedRefreshToken {
  iv: string;
  tag: string;
  ciphertext: string;
  keyVersion: number;
}

export interface UserDocument {
  email: string;
  name?: string | null;
  googleId?: string | null;
  storageProvider: "drive";
  encryptedRefreshToken: EncryptedRefreshToken | null;
  driveRootFolderId: string | null;
  driveReconnectRequired: boolean;
  driveReconnectAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const encryptedRefreshTokenSchema = new Schema<EncryptedRefreshToken>(
  {
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    ciphertext: { type: String, required: true },
    keyVersion: { type: Number, required: true, default: 1 },
  },
  { _id: false },
);

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, trim: true, default: null },
    googleId: { type: String, default: null },
    storageProvider: {
      type: String,
      enum: ["drive"],
      default: "drive",
      required: true,
    },
    encryptedRefreshToken: {
      type: encryptedRefreshTokenSchema,
      default: null,
    },
    driveRootFolderId: { type: String, default: null },
    driveReconnectRequired: { type: Boolean, default: false },
    driveReconnectAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { sparse: true });

export const User: Model<UserDocument> =
  (models.User as Model<UserDocument> | undefined) ??
  model<UserDocument>("User", userSchema);
