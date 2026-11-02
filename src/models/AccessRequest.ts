import { Schema, model, models, type Model } from "mongoose";

export type AccessRequestStatus = "new" | "approved" | "dismissed";

export interface AccessRequestDocument {
  email: string;
  message?: string | null;
  status: AccessRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const accessRequestSchema = new Schema<AccessRequestDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    message: { type: String, trim: true, maxlength: 1000, default: null },
    status: {
      type: String,
      enum: ["new", "approved", "dismissed"],
      default: "new",
      required: true,
    },
  },
  { timestamps: true },
);

accessRequestSchema.index({ email: 1 }, { unique: true });
accessRequestSchema.index({ status: 1, createdAt: -1 });

export const AccessRequest: Model<AccessRequestDocument> =
  (models.AccessRequest as Model<AccessRequestDocument> | undefined) ??
  model<AccessRequestDocument>("AccessRequest", accessRequestSchema);
