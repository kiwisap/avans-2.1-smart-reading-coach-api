export const READING_STATUSES = ['unread', 'read'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];
