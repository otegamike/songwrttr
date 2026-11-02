import { Schema, model, models, type Model, type Types } from "mongoose";

export interface TakeDocument {
  userId: string;
  songId: Types.ObjectId;
  name: string;
  driveFileId: string;
  mimeType: string;
  size: number;
  md5Checksum: string;
  durationMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const takeSchema = new Schema<TakeDocument>(
  {
    userId: { type: String, required: true },
    songId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    driveFileId: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    md5Checksum: { type: String, required: true },
    durationMs: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

takeSchema.index({ songId: 1, createdAt: -1 });
takeSchema.index({ driveFileId: 1 });
takeSchema.index({ userId: 1, driveFileId: 1 });

export const Take: Model<TakeDocument> =
  (models.Take as Model<TakeDocument> | undefined) ??
  model<TakeDocument>("Take", takeSchema);
