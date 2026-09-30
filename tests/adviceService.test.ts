import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BookDto } from '../src/dto/bookDto.js';
import type { ReadingProfile } from '../src/entities/readingProfile.js';
import type { CandidateQuery } from '../src/repositories/bookRepository.js';
import { createAdviceService } from '../src/services/adviceService.js';

const makeBook = (
    id: string,
    title: string,
    levels: BookDto['levels'],
    themes: string[],
): BookDto => ({
    id,
    title,
    author: null,
    type: 'boek',
    genre: null,
    format: null,
    description: null,
    themes,
    levels,
    levelLabel: levels.join('-') || null,
    url: null,
});

const catalog: BookDto[] = [
    makeBook('1', 'Liefdesboek', ['2F'], ['liefde']),
    makeBook('2', 'Oorlogsboek', ['2F'], ['oorlog']),
    makeBook('3', 'Humorboek', ['2F'], ['humor']),
    makeBook('4', 'Moeilijk boek', ['3F+'], ['liefde']),
];

function makeProfile(overrides: Partial<ReadingProfile> = {}): ReadingProfile {
    return {
        userId: 'u1',
        languageLevel: '2F',
        materialTypes: ['dichtbundel'],
        topics: ['liefde'],
        desiredLength: 'short',
        readingGoal: 'enjoyment',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

function setup(profile: ReadingProfile | null) {
    const bookRepository = {
        findCandidates: async ({ allowedLevels, topics, materialTypes }: CandidateQuery) =>
            catalog.filter(
                (book) =>
                    book.levels.some((level) => allowedLevels.includes(level)) &&
                    (!topics ||
                        book.themes.some((theme) => topics.includes(theme)) ||
                        (materialTypes ?? []).includes(book.type)),
            ),
    };
    const profileRepository = { findByUserId: async () => profile };
    return createAdviceService({ profileRepository, bookRepository });
}

describe('adviceService', () => {
    it('asks the student to fill in a profile first when there is none', async () => {
        await assert.rejects(
            setup(null).getAdvice('u1'),
            (err: unknown) => (err as { statusCode?: number }).statusCode === 409,
        );
    });

    it('puts the best topic match first and includes a motivation', async () => {
        const suggestions = await setup(makeProfile()).getAdvice('u1');
        assert.equal(suggestions[0]?.title, 'Liefdesboek');
        assert.ok((suggestions[0]?.motivation.length ?? 0) > 0);
    });

    it('falls back to the student level so there are always at least three suggestions', async () => {
        const suggestions = await setup(makeProfile()).getAdvice('u1');
        assert.ok(suggestions.length >= 3);
    });

    it('never suggests a book that is too difficult', async () => {
        const suggestions = await setup(makeProfile()).getAdvice('u1');
        assert.ok(!suggestions.some((suggestion) => suggestion.title === 'Moeilijk boek'));
    });

    it('gives different advice for different profiles', async () => {
        const a = await setup(makeProfile()).getAdvice('u1');
        const b = await setup(makeProfile({ topics: ['humor'] })).getAdvice('u1');
        assert.notEqual(a[0]?.title, b[0]?.title);
    });
});
