export interface InviteSummary {
  email: string;
  note: string | null;
  status: "active" | "revoked";
  createdAt: string;
}

export interface AccessRequestSummary {
  email: string;
  message: string | null;
  status: "new" | "approved" | "dismissed";
  createdAt: string;
}
