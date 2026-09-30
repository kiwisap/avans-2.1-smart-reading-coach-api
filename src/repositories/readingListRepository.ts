import { and, eq } from 'drizzle-orm';
import { readingListItems } from '../db/schema.js';
import type { ReadingListItem } from '../entities/readingListItem.js';
import type { Database } from '../db/types.js';
import type { ReadingStatus } from '../readingList/statuses.js';

// Every query filters on userId, so a student can never touch someone else's list.
export function createReadingListRepository(db: Database) {
    return {
        async listByUser(userId: string): Promise<ReadingListItem[]> {
            return db.select().from(readingListItems).where(eq(readingListItems.userId, userId));
        },

        // Returns null when the book is already on the list.
        async create(userId: string, bookId: string): Promise<ReadingListItem | null> {
            const [item] = await db
                .insert(readingListItems)
                .values({ userId, bookId })
                .onConflictDoNothing()
                .returning();
            return item ?? null;
        },

        async updateStatus(
            userId: string,
            id: string,
            status: ReadingStatus,
        ): Promise<ReadingListItem | null> {
            const [item] = await db
                .update(readingListItems)
                .set({ status, readAt: status === 'read' ? new Date() : null })
                .where(and(eq(readingListItems.id, id), eq(readingListItems.userId, userId)))
                .returning();
            return item ?? null;
        },

        async remove(userId: string, id: string): Promise<boolean> {
            const removed = await db
                .delete(readingListItems)
                .where(and(eq(readingListItems.id, id), eq(readingListItems.userId, userId)))
                .returning({ id: readingListItems.id });
            return removed.length > 0;
        },
    };
}

export type ReadingListRepository = ReturnType<typeof createReadingListRepository>;
