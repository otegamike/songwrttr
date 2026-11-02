import { Schema, model, models, type Model, type Types } from "mongoose";

export type UploadKind = "instrumental" | "take";

export interface UploadSessionDocument {
  userId: string;
  songId: Types.ObjectId;
  kind: UploadKind;
  fileName: string;
  mimeType: string;
  size: number;
  folderId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const uploadSessionSchema = new Schema<UploadSessionDocument>(
  {
    userId: { type: String, required: true },
    songId: { type: Schema.Types.ObjectId, required: true },
    kind: {
      type: String,
      enum: ["instrumental", "take"],
      required: true,
    },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    folderId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

uploadSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
uploadSessionSchema.index({ userId: 1, songId: 1, kind: 1 });

export const UploadSession: Model<UploadSessionDocument> =
  (models.UploadSession as Model<UploadSessionDocument> | undefined) ??
  model<UploadSessionDocument>("UploadSession", uploadSessionSchema);
