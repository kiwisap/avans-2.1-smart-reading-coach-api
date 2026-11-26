import type { bookRatings } from '../db/schema.js';

// A row of the book_ratings table in PostgreSQL.
export type BookRating = typeof bookRatings.$inferSelect;
