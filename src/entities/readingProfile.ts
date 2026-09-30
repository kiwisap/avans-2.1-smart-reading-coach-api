import type { readingProfiles } from '../db/schema.js';

// A row of the reading_profiles table in PostgreSQL.
export type ReadingProfile = typeof readingProfiles.$inferSelect;
