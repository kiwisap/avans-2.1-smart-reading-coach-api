import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ItemRow, RatingRow, ShownRow } from '../src/repositories/adviceStatsRepository.js';
import { createAdviceStatsService } from '../src/services/adviceStatsService.js';

function setup(shown: ShownRow[], items: ItemRow[], ratings: RatingRow[]) {
    return createAdviceStatsService({
        adviceStatsRepository: {
            shownBySource: async () => shown,
            itemsBySource: async () => items,
            ratingsBySource: async () => ratings,
        },
        userRepository: {
            findStudentsOfTeacher: async () => [
                { id: 's1', name: 'A', email: 'a@x.nl', hasProfile: true },
                { id: 's2', name: 'B', email: 'b@x.nl', hasProfile: false },
            ],
        },
    });
}

describe('adviceStatsService', () => {
    it('splits the reading lists by source and the advice by AI model and rules', async () => {
        const stats = await setup(
            [
                { source: 'ai', total: 10 },
                { source: 'rules', total: 5 },
            ],
            [
                { source: 'advice', suggestedBy: 'ai', total: 4, read: 2 },
                { source: 'advice', suggestedBy: 'rules', total: 1, read: 0 },
                { source: 'catalog', suggestedBy: null, total: 3, read: 1 },
                { source: 'catalog', suggestedBy: 'ai', total: 2, read: 2 },
                { source: 'teacher', suggestedBy: null, total: 1, read: 0 },
                { source: null, suggestedBy: null, total: 2, read: 2 },
            ],
            [
                { source: 'advice', suggestedBy: 'ai', total: 2, stars: 9 },
                { source: 'catalog', suggestedBy: null, total: 3, stars: 9 },
            ],
        ).getStats('t1');

        assert.equal(stats.students, 2);
        assert.equal(stats.shown, 15);
        assert.deepEqual(stats.added.advice, { total: 5, read: 2, rated: 2, averageRating: 4.5 });
        assert.deepEqual(stats.added.catalog, { total: 5, read: 3, rated: 3, averageRating: 3 });
        assert.deepEqual(stats.added.unknown, { total: 2, read: 2, rated: 0, averageRating: null });
        assert.equal(stats.catalogAlsoSuggested, 2);
        assert.deepEqual(stats.bySource.ai, {
            shown: 10,
            added: 4,
            read: 2,
            rated: 2,
            averageRating: 4.5,
        });
        assert.deepEqual(stats.bySource.rules, {
            shown: 5,
            added: 1,
            read: 0,
            rated: 0,
            averageRating: null,
        });
    });
});
