import { asc, eq } from 'drizzle-orm';
import { xpEvents } from '../db/schema.js';
import type { Database } from '../db/types.js';
import type { XpEvent } from '../entities/xpEvent.js';
import type { XpReason } from '../progress/xp.js';

export function createXpRepository(db: Database) {
    return {
        // Returns false when the student already got XP for this reason and title.
        async award(
            userId: string,
            reason: XpReason,
            bookId: string,
            xp: number,
        ): Promise<boolean> {
            const inserted = await db
                .insert(xpEvents)
                .values({ userId, reason, bookId, xp })
                .onConflictDoNothing()
                .returning({ id: xpEvents.id });
            return inserted.length > 0;
        },

        // Oldest first, so the moment a badge was reached can be worked out.
        async listByUser(userId: string): Promise<XpEvent[]> {
            return db
                .select()
                .from(xpEvents)
                .where(eq(xpEvents.userId, userId))
                .orderBy(asc(xpEvents.createdAt));
        },
    };
}

export type XpRepository = ReturnType<typeof createXpRepository>;
