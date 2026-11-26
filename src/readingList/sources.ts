// Where a title on the reading list came from, so we can see whether the advice of Bo helps.
// advice: added from the advice page. catalog: added from the catalog. teacher: added by a teacher.
// Titles added before this was tracked have no source (null).
export const READING_LIST_SOURCES = ['advice', 'catalog', 'teacher'] as const;
export type ReadingListSource = (typeof READING_LIST_SOURCES)[number];

// The sources a student can choose when adding a title themselves.
export const STUDENT_SOURCES = ['advice', 'catalog'] as const;
export type StudentSource = (typeof STUDENT_SOURCES)[number];
