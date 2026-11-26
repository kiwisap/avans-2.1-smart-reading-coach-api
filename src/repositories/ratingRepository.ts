import { and, avg, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { bookRatings, readingProfiles, users } from '../db/schema.js';
import type { Database } from '../db/types.js';
import type { BookRating } from '../entities/bookRating.js';
import type { LanguageLevel } from '../profile/profileOptions.js';
import type { ReadingListSource } from '../readingList/sources.js';

export interface PeerRating {
    average: number;
    count: number;
}

export function createRatingRepository(db: Database) {
    return {
        async upsert(
            userId: string,
            bookId: string,
            rating: number,
            comment: string | null,
            source: ReadingListSource | null,
        ): Promise<BookRating> {
            const [saved] = await db
                .insert(bookRatings)
                .values({ userId, bookId, rating, comment, source })
                .onConflictDoUpdate({
                    target: [bookRatings.userId, bookRatings.bookId],
                    set: { rating, comment, updatedAt: new Date() },
                })
                .returning();
            if (!saved) throw new Error('Could not save rating');
            return saved;
        },

        async findForBooks(userId: string, bookIds: string[]): Promise<BookRating[]> {
            if (bookIds.length === 0) return [];
            return db
                .select()
                .from(bookRatings)
                .where(and(eq(bookRatings.userId, userId), inArray(bookRatings.bookId, bookIds)));
        },

        // Average stars per title from other students who read at the same level and share at
        // least one topic: students like this one.
        async peerRatings(
            userId: string,
            languageLevel: LanguageLevel,
            topics: string[],
        ): Promise<Map<string, PeerRating>> {
            if (topics.length === 0) return new Map();
            const rows = await db
                .select({
                    bookId: bookRatings.bookId,
                    average: avg(bookRatings.rating).mapWith(Number),
                    count: count(),
                })
                .from(bookRatings)
                .innerJoin(users, eq(users.id, bookRatings.userId))
                .innerJoin(readingProfiles, eq(readingProfiles.userId, bookRatings.userId))
                .where(
                    and(
                        ne(bookRatings.userId, userId),
                        eq(users.role, 'student'),
                        eq(readingProfiles.languageLevel, languageLevel),
                        sql`${readingProfiles.topics} && ${sql.param(topics)}::text[]`,
                    ),
                )
                .groupBy(bookRatings.bookId);
            return new Map(
                rows.map((row) => [row.bookId, { average: row.average, count: row.count }]),
            );
        },
    };
}

export type RatingRepository = ReturnType<typeof createRatingRepository>;
