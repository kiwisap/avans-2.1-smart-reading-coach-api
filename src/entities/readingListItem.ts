import type { readingListItems } from '../db/schema.js';

// A row of the reading_list_items table in PostgreSQL.
export type ReadingListItem = typeof readingListItems.$inferSelect;
