import type { xpEvents } from '../db/schema.js';

// A row of the xp_events table in PostgreSQL.
export type XpEvent = typeof xpEvents.$inferSelect;
