import { Schema, model, models, type Model } from "mongoose";

export interface AuditLogDocument {
  userId: string;
  tokenId: string | null;
  action: string;
  targetId: string;
  at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    userId: { type: String, required: true },
    tokenId: { type: String, default: null },
    action: { type: String, required: true, maxlength: 100 },
    targetId: { type: String, required: true, maxlength: 200 },
    at: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

auditLogSchema.index({ userId: 1, at: -1 });
auditLogSchema.index({ tokenId: 1, at: -1 }, { sparse: true });

export const AuditLog: Model<AuditLogDocument> =
  (models.AuditLog as Model<AuditLogDocument> | undefined) ??
  model<AuditLogDocument>("AuditLog", auditLogSchema);
