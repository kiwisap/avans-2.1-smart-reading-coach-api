import type { users } from '../db/schema.js';

// A row of the users table in PostgreSQL.
export type User = typeof users.$inferSelect;
