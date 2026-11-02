import { Schema, model, models, type Model } from "mongoose";

export type AllowedEmailStatus = "active" | "revoked";

export interface AllowedEmailDocument {
  email: string;
  note?: string | null;
  status: AllowedEmailStatus;
  createdAt: Date;
  updatedAt: Date;
}

const allowedEmailSchema = new Schema<AllowedEmailDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    note: { type: String, trim: true, maxlength: 200, default: null },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true },
);

allowedEmailSchema.index({ email: 1 }, { unique: true });
allowedEmailSchema.index({ status: 1 });

export const AllowedEmail: Model<AllowedEmailDocument> =
  (models.AllowedEmail as Model<AllowedEmailDocument> | undefined) ??
  model<AllowedEmailDocument>("AllowedEmail", allowedEmailSchema);
