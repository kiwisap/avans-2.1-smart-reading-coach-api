export const USER_ROLES = ['student', 'teacher'] as const;
export type UserRole = (typeof USER_ROLES)[number];
