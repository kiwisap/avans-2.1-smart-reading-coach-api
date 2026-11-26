import type { emailTokens } from '../db/schema.js';

// A row of the email_tokens table in PostgreSQL.
export type EmailToken = typeof emailTokens.$inferSelect;
