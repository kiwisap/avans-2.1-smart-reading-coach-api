import { and, count, eq, sql, sum } from 'drizzle-orm';
import { adviceSuggestions, bookRatings, readingListItems, teacherStudents } from '../db/schema.js';
import type { Database } from '../db/types.js';
import type { AdviceSource } from '../advice/sources.js';
import type { ReadingListSource } from '../readingList/sources.js';

export interface ShownRow {
    source: AdviceSource;
    total: number;
}

export interface ItemRow {
    source: ReadingListSource | null; // where the title was added
    suggestedBy: AdviceSource | null; // whether Bo showed the title before, and how
    total: number;
    read: number;
}

export interface RatingRow {
    source: ReadingListSource | null;
    suggestedBy: AdviceSource | null;
    total: number; // number of ratings
    stars: number; // sum of the stars
}

// Numbers about the advice of Bo, always limited to the students a teacher is linked to.
export function createAdviceStatsRepository(db: Database) {
    return {
        async shownBySource(teacherId: string): Promise<ShownRow[]> {
            return db
                .select({ source: adviceSuggestions.source, total: count() })
                .from(adviceSuggestions)
                .innerJoin(
                    teacherStudents,
                    and(
                        eq(teacherStudents.studentId, adviceSuggestions.userId),
                        eq(teacherStudents.teacherId, teacherId),
                    ),
                )
                .groupBy(adviceSuggestions.source);
        },

        async itemsBySource(teacherId: string): Promise<ItemRow[]> {
            return db
                .select({
                    source: readingListItems.source,
                    suggestedBy: adviceSuggestions.source,
                    total: count(),
                    read: sql<number>`count(*) filter (where ${readingListItems.status} = 'read')`.mapWith(
                        Number,
                    ),
                })
                .from(readingListItems)
                .innerJoin(
                    teacherStudents,
                    and(
                        eq(teacherStudents.studentId, readingListItems.userId),
                        eq(teacherStudents.teacherId, teacherId),
                    ),
                )
                .leftJoin(
                    adviceSuggestions,
                    and(
                        eq(adviceSuggestions.userId, readingListItems.userId),
                        eq(adviceSuggestions.bookId, readingListItems.bookId),
                    ),
                )
                .groupBy(readingListItems.source, adviceSuggestions.source);
        },

        // Ratings stay when a title leaves the reading list, so they are counted separately,
        // by the source the title had when it was rated.
        async ratingsBySource(teacherId: string): Promise<RatingRow[]> {
            return db
                .select({
                    source: bookRatings.source,
                    suggestedBy: adviceSuggestions.source,
                    total: count(),
                    stars: sum(bookRatings.rating).mapWith(Number),
                })
                .from(bookRatings)
                .innerJoin(
                    teacherStudents,
                    and(
                        eq(teacherStudents.studentId, bookRatings.userId),
                        eq(teacherStudents.teacherId, teacherId),
                    ),
                )
                .leftJoin(
                    adviceSuggestions,
                    and(
                        eq(adviceSuggestions.userId, bookRatings.userId),
                        eq(adviceSuggestions.bookId, bookRatings.bookId),
                    ),
                )
                .groupBy(bookRatings.source, adviceSuggestions.source);
        },
    };
}

export type AdviceStatsRepository = ReturnType<typeof createAdviceStatsRepository>;
