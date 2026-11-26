import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AiClient, AiHistoryItem, AiRecommendation } from '../src/advice/aiClient.js';
import type { BookDto } from '../src/dto/bookDto.js';
import type { ReadingListItem } from '../src/entities/readingListItem.js';
import type { ReadingProfile } from '../src/entities/readingProfile.js';
import type { CandidateQuery } from '../src/repositories/bookRepository.js';
import type { PeerRating } from '../src/repositories/ratingRepository.js';
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

const recommendation = (book: BookDto, story: string): AiRecommendation => ({
    catalogCode: `CAT-${book.id}`,
    key: keyOf(book),
    title: book.title,
    author: null,
    type: 'boek',
    genre: 'fictie',
    level: '2F',
    score: 0.9,
    reasons: [story, 'Het niveau past bij jou.'],
    motivation: story,
});

interface SetupOptions {
    profile?: ReadingProfile | null;
    aiClient?: AiClient | null;
    readingList?: ReadingListItem[];
    peers?: Record<string, PeerRating>;
    ratings?: Record<string, number>; // own stars per book id
    synonyms?: Record<string, string[]>; // related themes per topic, as the AI service stores them
}

const listItem = (bookId: string, status: ReadingListItem['status']): ReadingListItem => ({
    id: `item-${bookId}`,
    userId: 'u1',
    bookId,
    status,
    addedAt: new Date(),
    readAt: status === 'read' ? new Date() : null,
    source: 'catalog',
});

function setup({
    profile = makeProfile(),
    aiClient = null,
    readingList = [],
    peers = {},
    ratings = {},
    synonyms = {},
}: SetupOptions = {}) {
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
    const shown: { bookIds: string[]; source: string }[] = [];
    const suggestionRepository = {
        recordShown: async (_userId: string, bookIds: string[], source: string) => {
            shown.push({ bookIds, source });
        },
    };
    const ratingRepository = {
        findForBooks: async (userId: string, bookIds: string[]) =>
            bookIds.flatMap((bookId) =>
                ratings[bookId]
                    ? [
                          {
                              userId,
                              bookId,
                              rating: ratings[bookId],
                              comment: null,
                              source: null,
                              createdAt: new Date(),
                              updatedAt: new Date(),
                          },
                      ]
                    : [],
            ),
        peerRatings: async () => new Map(Object.entries(peers)),
    };
    const synonymRepository = {
        relatedTo: async (terms: string[]) =>
            new Map(terms.flatMap((term) => (synonyms[term] ? [[term, synonyms[term]]] : []))),
    };
    const service = createAdviceService({
        profileRepository,
        bookRepository,
        readingListRepository,
        suggestionRepository,
        ratingRepository,
        synonymRepository,
        aiClient,
    });
    return Object.assign(service, { shown });
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
        retrain: async () => true,
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

    it('also matches themes the AI service learned as related to a topic', async () => {
        const profile = makeProfile({ topics: ['romantiek'] });
        const { suggestions } = await setup({
            profile,
            synonyms: { romantiek: ['liefde'] },
        }).getAdvice('u1');
        assert.equal(suggestions[0]?.title, 'Liefdesboek');
        // Bo talks about the topic the student chose, not about the related theme.
        assert.match(suggestions[0]?.motivation ?? '', /romantiek/);
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
        const readingList = [
            listItem('1', 'read'),
            listItem('2', 'unread'),
            listItem('gone', 'unread'),
        ];
        await setup({ aiClient: client, readingList, ratings: { '1': 5 } }).getAdvice('u1');
        // The own rating goes along, a title that left the catalog does not.
        assert.deepEqual(calls[0]?.history, [
            { key: keyOf(liefde), status: 'read', rating: 5 },
            { key: keyOf(oorlog), status: 'unread' },
        ]);
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

describe('adviceService keeps changing with the reading list', () => {
    it('never suggests a title the student read', async () => {
        const readingList = [listItem(liefde.id, 'read')];
        const { suggestions } = await setup({ readingList }).getAdvice('u1');
        assert.ok(suggestions.length > 0);
        assert.ok(!suggestions.some((suggestion) => suggestion.id === liefde.id));
    });

    it('does not suggest titles that are already on the reading list either', async () => {
        const readingList = [listItem(liefde.id, 'unread'), listItem(humor.id, 'unread')];
        const { suggestions } = await setup({ readingList }).getAdvice('u1');
        assert.deepEqual(
            suggestions.map((suggestion) => suggestion.id),
            [oorlog.id],
        );
    });

    it('leaves out a title the AI model suggests when it is on the reading list', async () => {
        const { client } = fakeAi([
            recommendation(liefde, 'a'),
            recommendation(oorlog, 'b'),
            recommendation(humor, 'c'),
        ]);
        const readingList = [listItem(liefde.id, 'read')];
        const { source } = await setup({ aiClient: client, readingList }).getAdvice('u1');
        // Two titles are left, too few for AI advice, so the rules take over without liefde.
        assert.equal(source, 'rules');
    });

    it('remembers which titles Bo showed, but not when a teacher looks', async () => {
        const service = setup();
        const advice = await service.getAdvice('u1');
        assert.deepEqual(service.shown, [
            { bookIds: advice.suggestions.map((s) => s.id), source: 'rules' },
        ]);
        await service.getAdvice('u1', undefined, { record: false });
        assert.equal(service.shown.length, 1);
    });
});

describe('adviceService with ratings of students like this one', () => {
    it('moves a title up that similar students loved, and says so', async () => {
        const peers = { [humor.id]: { average: 5, count: 3 } };
        const { suggestions } = await setup({ peers }).getAdvice('u1');
        // Humor does not match the topics, but five stars from peers weigh as much as a topic.
        const humorSuggestion = suggestions.find((s) => s.id === humor.id);
        assert.ok(humorSuggestion?.reasons.some((reason) => reason.includes('gemiddeld 5')));
        assert.ok(
            suggestions.findIndex((s) => s.id === humor.id) <
                suggestions.findIndex((s) => s.id === oorlog.id),
        );
    });

    it('leaves out a title similar students did not like', async () => {
        const peers = { [liefde.id]: { average: 1.5, count: 4 } };
        const { suggestions } = await setup({ peers }).getAdvice('u1');
        assert.ok(!suggestions.some((s) => s.id === liefde.id));
    });

    it('ignores a single peer rating', async () => {
        const peers = { [liefde.id]: { average: 1, count: 1 } };
        const { suggestions } = await setup({ peers }).getAdvice('u1');
        assert.equal(suggestions[0]?.id, liefde.id);
    });

    it('also filters and explains the AI advice with peer ratings', async () => {
        const { client } = fakeAi([
            recommendation(humor, 'Het gaat over humor.'),
            recommendation(oorlog, 'Het gaat over oorlog.'),
            recommendation(liefde, 'Het gaat over liefde.'),
            recommendation(catalog[3] as BookDto, 'Moeilijk.'),
        ]);
        const peers = {
            [oorlog.id]: { average: 4.5, count: 2 },
            [(catalog[3] as BookDto).id]: { average: 1, count: 2 },
        };
        const { source, suggestions } = await setup({ aiClient: client, peers }).getAdvice('u1');
        assert.equal(source, 'ai');
        assert.deepEqual(
            suggestions.map((s) => s.title),
            ['Humorboek', 'Oorlogsboek', 'Liefdesboek'],
        );
        assert.ok(suggestions[1]?.reasons.at(-1)?.includes('4,5'));
        assert.match(suggestions[1]?.motivation ?? '', /^Het gaat over oorlog\. .*4,5/);
    });
});
