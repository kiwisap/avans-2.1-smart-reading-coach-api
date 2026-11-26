import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AiClient, AiHistoryItem, AiRecommendation } from '../src/advice/aiClient.js';
import type { BookDto } from '../src/dto/bookDto.js';
import type { ReadingListItem } from '../src/entities/readingListItem.js';
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

// In MongoDB every title also has a key (title|author|type). Here the key is the title in lowercase.
const keyOf = (book: BookDto) => `${book.title.toLowerCase()}||boek`;

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

const recommendation = (book: BookDto, summary: string): AiRecommendation => ({
    cataloguscode: `CAT-${book.id}`,
    key: keyOf(book),
    title: book.title,
    author: null,
    type: 'boek',
    genre: 'fictie',
    level: '2F',
    score: 0.9,
    reasons: [summary, 'Het niveau past bij jou.'],
    summary,
});

interface SetupOptions {
    profile?: ReadingProfile | null;
    aiClient?: AiClient | null;
    readingList?: ReadingListItem[];
}

function setup({ profile = makeProfile(), aiClient = null, readingList = [] }: SetupOptions = {}) {
    const bookRepository = {
        findCandidates: async ({ allowedLevels, topics, materialTypes }: CandidateQuery) =>
            catalog.filter(
                (book) =>
                    book.levels.some((level) => allowedLevels.includes(level)) &&
                    (!topics ||
                        book.themes.some((theme) => topics.includes(theme)) ||
                        (materialTypes ?? []).includes(book.type)),
            ),
        findByKeys: async (keys: string[]) =>
            new Map(catalog.filter((book) => keys.includes(keyOf(book))).map((b) => [keyOf(b), b])),
        findKeysByIds: async (ids: string[]) =>
            new Map(catalog.filter((book) => ids.includes(book.id)).map((b) => [b.id, keyOf(b)])),
    };
    const profileRepository = { findByUserId: async () => profile };
    const readingListRepository = { listByUser: async () => readingList };
    return createAdviceService({
        profileRepository,
        bookRepository,
        readingListRepository,
        aiClient,
    });
}

// A fake AI service that records what it was asked and answers with the given recommendations.
function fakeAi(answer: AiRecommendation[] | null) {
    const calls: { history: AiHistoryItem[]; count: number }[] = [];
    const client: AiClient = {
        recommend: async (_profile, history, count) => {
            calls.push({ history, count });
            return answer;
        },
        isHealthy: async () => answer !== null,
    };
    return { client, calls };
}

const [liefde, oorlog, humor] = catalog as [BookDto, BookDto, BookDto, BookDto];

describe('adviceService with the rules', () => {
    it('asks the student to fill in a profile first when there is none', async () => {
        await assert.rejects(
            setup({ profile: null }).getAdvice('u1'),
            (err: unknown) => (err as { statusCode?: number }).statusCode === 409,
        );
    });

    it('puts the best topic match first and includes a motivation and reasons', async () => {
        const { source, suggestions } = await setup().getAdvice('u1');
        assert.equal(source, 'rules');
        assert.equal(suggestions[0]?.title, 'Liefdesboek');
        assert.ok((suggestions[0]?.motivation.length ?? 0) > 0);
        assert.ok((suggestions[0]?.reasons.length ?? 0) > 0);
    });

    it('falls back to the student level so there are always at least three suggestions', async () => {
        const { suggestions } = await setup().getAdvice('u1');
        assert.ok(suggestions.length >= 3);
    });

    it('never suggests a book that is too difficult', async () => {
        const { suggestions } = await setup().getAdvice('u1');
        assert.ok(!suggestions.some((suggestion) => suggestion.title === 'Moeilijk boek'));
    });

    it('gives different advice for different profiles', async () => {
        const a = await setup().getAdvice('u1');
        const b = await setup({ profile: makeProfile({ topics: ['humor'] }) }).getAdvice('u1');
        assert.notEqual(a.suggestions[0]?.title, b.suggestions[0]?.title);
    });
});

describe('adviceService with the AI service', () => {
    it('uses the AI advice, in the order of the model, with its reasons', async () => {
        const { client } = fakeAi([
            recommendation(humor, 'Het gaat over humor.'),
            recommendation(oorlog, 'Het gaat over oorlog.'),
            recommendation(liefde, 'Het gaat over liefde.'),
        ]);
        const { source, suggestions } = await setup({ aiClient: client }).getAdvice('u1');
        assert.equal(source, 'ai');
        assert.deepEqual(
            suggestions.map((s) => s.title),
            ['Humorboek', 'Oorlogsboek', 'Liefdesboek'],
        );
        assert.equal(suggestions[0]?.motivation, 'Het gaat over humor.');
        assert.equal(suggestions[0]?.reasons.length, 2);
    });

    it('sends the reading list as history, identified by catalog key', async () => {
        const { client, calls } = fakeAi([
            recommendation(humor, 'a'),
            recommendation(oorlog, 'b'),
            recommendation(liefde, 'c'),
        ]);
        const readingList: ReadingListItem[] = [
            {
                id: 'i1',
                userId: 'u1',
                bookId: '1',
                status: 'read',
                addedAt: new Date(),
                readAt: new Date(),
            },
            {
                id: 'i2',
                userId: 'u1',
                bookId: 'gone',
                status: 'unread',
                addedAt: new Date(),
                readAt: null,
            },
        ];
        await setup({ aiClient: client, readingList }).getAdvice('u1');
        assert.deepEqual(calls[0]?.history, [{ key: keyOf(liefde), status: 'read' }]);
        assert.equal(calls[0]?.count, 5);
    });

    it('falls back to the rules when the AI service is not available', async () => {
        const { client } = fakeAi(null);
        const { source, suggestions } = await setup({ aiClient: client }).getAdvice('u1');
        assert.equal(source, 'rules');
        assert.equal(suggestions[0]?.title, 'Liefdesboek');
    });

    it('falls back to the rules when too few AI titles exist in the catalog', async () => {
        const unknown = { ...recommendation(humor, 'x'), key: 'not in the catalog' };
        const { client } = fakeAi([unknown, unknown, recommendation(oorlog, 'y')]);
        const { source } = await setup({ aiClient: client }).getAdvice('u1');
        assert.equal(source, 'rules');
    });

    it('still asks for a profile first, without calling the AI service', async () => {
        const { client, calls } = fakeAi([]);
        await assert.rejects(setup({ profile: null, aiClient: client }).getAdvice('u1'));
        assert.equal(calls.length, 0);
    });
});
