/** Access level granted to a shared-app collaborator. */
export const ShareRole = {
  View: 'view',
  Manage: 'manage',
} as const;
export type ShareRole = (typeof ShareRole)[keyof typeof ShareRole];
