import { sql } from 'drizzle-orm';
import { adviceSuggestions } from '../db/schema.js';
import type { Database } from '../db/types.js';
import type { AdviceSource } from '../advice/sources.js';

export function createSuggestionRepository(db: Database) {
    return {
        // Remembers which titles Bo showed. A title shown before keeps its first source and time.
        async recordShown(userId: string, bookIds: string[], source: AdviceSource): Promise<void> {
            if (bookIds.length === 0) return;
            await db
                .insert(adviceSuggestions)
                .values(bookIds.map((bookId) => ({ userId, bookId, source })))
                .onConflictDoUpdate({
                    target: [adviceSuggestions.userId, adviceSuggestions.bookId],
                    set: { lastShownAt: sql`now()` },
                });
        },
    };
}

export type SuggestionRepository = ReturnType<typeof createSuggestionRepository>;
