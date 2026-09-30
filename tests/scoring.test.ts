import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMotivation, describeBook } from '../src/advice/motivation.js';
import { allowedLevels, scoreBook, type ScorableBook } from '../src/advice/scoring.js';
import type { ProfileData } from '../src/profile/profileOptions.js';

const profile: ProfileData = {
    languageLevel: '3F',
    materialTypes: ['boek'],
    topics: ['liefde', 'familie'],
    desiredLength: 'long',
    readingGoal: 'enjoyment',
};

const book = (overrides: Partial<ScorableBook> = {}): ScorableBook => ({
    type: 'boek',
    levels: ['3F'],
    themes: [],
    ...overrides,
});

// scoreBook returns null for books that are too difficult, tests that expect a score use this helper.
function score(p: ProfileData, b: ScorableBook) {
    const result = scoreBook(p, b);
    assert.ok(result, 'expected the book to be eligible');
    return result;
}

describe('scoreBook', () => {
    it('scores a book with matching topics higher than one without', () => {
        const match = score(profile, book({ themes: ['liefde', 'familie'] }));
        const noMatch = score(profile, book({ themes: ['oorlog'] }));
        assert.ok(match.score > noMatch.score);
        assert.deepEqual(match.reasons.topics, ['liefde', 'familie']);
    });

    it('excludes books that are harder than the profile level', () => {
        assert.equal(
            scoreBook({ ...profile, languageLevel: '2F' }, book({ levels: ['3F'] })),
            null,
        );
    });

    it('accepts a 2F-3F book for a 2F student', () => {
        const result = score({ ...profile, languageLevel: '2F' }, book({ levels: ['2F', '3F'] }));
        assert.equal(result.reasons.level, 'exact');
    });

    it('gives easier books a smaller level score than exact ones', () => {
        const exact = score(profile, book({ levels: ['3F'] }));
        const easier = score(profile, book({ levels: ['2F'] }));
        assert.equal(easier.reasons.level, 'easier');
        assert.ok(exact.score > easier.score);
    });

    it('keeps books without a level (edge case) instead of crashing', () => {
        const result = score(profile, book({ levels: [] }));
        assert.equal(result.reasons.level, 'unknown');
    });

    it('allowedLevels returns the own level and easier ones', () => {
        assert.deepEqual(allowedLevels('2F'), ['2F']);
        assert.deepEqual(allowedLevels('3F+'), ['2F', '3F', '3F+']);
    });
});

describe('motivation', () => {
    it('only mentions what actually matched', () => {
        const b = book({ themes: ['liefde'] });
        const { reasons } = score(profile, b);
        const text = buildMotivation(profile, b, reasons);
        assert.match(text, /liefde/);
        assert.doesNotMatch(text, /familie/);
    });

    it('describeBook falls back to a generated sentence without a description', () => {
        const text = describeBook({
            type: 'dichtbundel',
            author: 'A. Dichter',
            themes: ['identiteit'],
            description: null,
        });
        assert.equal(text, 'Een dichtbundel van A. Dichter over identiteit.');
    });
});
