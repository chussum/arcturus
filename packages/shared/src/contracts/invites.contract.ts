export interface CreateInviteRequest {
  /** Optional note shown in the invite list, e.g. the invitee's name. */
  memo?: string;
}

export interface InviteSummary {
  id: string;
  code: string;
  memo: string | null;
  createdBy: string;
  /** Username of the member who consumed this invite, if any. */
  usedBy: string | null;
  expiresAt: string;
  createdAt: string;
}
