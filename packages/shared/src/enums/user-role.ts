/** Access level of a platform account. */
export const UserRole = {
  /** Can manage members, invites and every app. */
  Admin: 'admin',
  /** Can manage only their own apps and tokens. */
  Member: 'member',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
