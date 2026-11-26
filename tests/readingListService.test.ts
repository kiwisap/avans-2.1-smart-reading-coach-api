import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BookDto } from '../src/dto/bookDto.js';
import type { ReadingListItem } from '../src/entities/readingListItem.js';
import type { BookRating } from '../src/entities/bookRating.js';
import type { XpReason } from '../src/progress/xp.js';
import type { ReadingListSource } from '../src/readingList/sources.js';
import type { ReadingStatus } from '../src/readingList/statuses.js';
import { createReadingListService } from '../src/services/readingListService.js';

const makeBook = (id: string, title: string): BookDto => ({
    id,
    title,
    author: null,
    type: 'boek',
    genre: null,
    format: null,
    description: null,
    themes: [],
    levels: ['2F'],
    levelLabel: '2F',
    url: null,
});

const books: Record<string, BookDto> = {
    b1: makeBook('b1', 'Boek 1'),
    b2: makeBook('b2', 'Boek 2'),
};

const item = (overrides: Partial<ReadingListItem> = {}): ReadingListItem => ({
    id: 'x',
    userId: 'u1',
    bookId: 'b1',
    status: 'unread',
    addedAt: new Date('2026-01-01'),
    readAt: null,
    source: 'catalog',
    ...overrides,
});

function setup(initialItems: ReadingListItem[] = []) {
    const items = [...initialItems];
    const readingListRepository = {
        listByUser: async (userId: string) => items.filter((i) => i.userId === userId),
        create: async (userId: string, bookId: string, source: ReadingListSource) => {
            if (items.some((i) => i.userId === userId && i.bookId === bookId)) return null;
            const created = item({
                id: `i${items.length + 1}`,
                userId,
                bookId,
                source,
                addedAt: new Date(),
            });
            items.push(created);
            return created;
        },
        findById: async (userId: string, id: string) =>
            items.find((i) => i.id === id && i.userId === userId) ?? null,
        updateStatus: async (userId: string, id: string, status: ReadingStatus) => {
            const found = items.find((i) => i.id === id && i.userId === userId);
            if (!found) return null;
            found.status = status;
            return found;
        },
        remove: async (userId: string, id: string) => {
            const index = items.findIndex((i) => i.id === id && i.userId === userId);
            if (index === -1) return false;
            items.splice(index, 1);
            return true;
        },
    };
    const bookRepository = {
        findById: async (id: string) => books[id] ?? null,
        findByIds: async (ids: string[]) => ids.flatMap((id) => (books[id] ? [books[id]] : [])),
    };
    const awards: string[] = [];
    const awarded = new Set<string>();
    const xpRepository = {
        award: async (userId: string, reason: XpReason, bookId: string, xp: number) => {
            const id = `${userId}:${reason}:${bookId}`;
            if (awarded.has(id)) return false;
            awarded.add(id);
            awards.push(`${id}:${xp}`);
            return true;
        },
    };
    const ratings: BookRating[] = [];
    const ratingRepository = {
        findForBooks: async (userId: string, bookIds: string[]) =>
            ratings.filter((r) => r.userId === userId && bookIds.includes(r.bookId)),
        upsert: async (
            userId: string,
            bookId: string,
            rating: number,
            comment: string | null,
            source: ReadingListSource | null,
        ) => {
            const saved: BookRating = {
                userId,
                bookId,
                rating,
                comment,
                source,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const index = ratings.findIndex((r) => r.userId === userId && r.bookId === bookId);
            if (index === -1) ratings.push(saved);
            else ratings[index] = saved;
            return saved;
        },
    };
    const service = createReadingListService({
        readingListRepository,
        bookRepository,
        xpRepository,
        ratingRepository,
    });
    return Object.assign(service, { awards, ratings });
}

const statusOf = (err: unknown) => (err as { statusCode?: number }).statusCode;

describe('readingListService', () => {
    it('adds a catalog title and returns it with book details', async () => {
        const service = setup();
        const added = await service.add('u1', 'b1', 'catalog');
        assert.equal(added.status, 'unread');
        assert.equal(added.book?.title, 'Boek 1');
    });

    it('rejects a title that is not in the catalog', async () => {
        await assert.rejects(
            setup().add('u1', 'nope', 'catalog'),
            (err: unknown) => statusOf(err) === 404,
        );
    });

    it('rejects adding the same title twice', async () => {
        const service = setup();
        await service.add('u1', 'b1', 'catalog');
        await assert.rejects(
            service.add('u1', 'b1', 'catalog'),
            (err: unknown) => statusOf(err) === 409,
        );
    });

    it('shows unread items before read items, newest first', async () => {
        const service = setup([
            item({ id: 'a', bookId: 'b1', status: 'read' }),
            item({ id: 'b', bookId: 'b2', status: 'unread' }),
        ]);
        const list = await service.list('u1');
        assert.deepEqual(
            list.map((i) => i.id),
            ['b', 'a'],
        );
    });

    it('keeps items whose book was removed from the catalog, with book set to null', async () => {
        const service = setup([item({ bookId: 'gone' })]);
        const [entry] = await service.list('u1');
        assert.equal(entry?.book, null);
    });

    it("does not let a student change another student's item", async () => {
        const service = setup([item({ id: 'a', userId: 'u2' })]);
        await assert.rejects(
            service.setStatus('u1', 'a', 'read'),
            (err: unknown) => statusOf(err) === 404,
        );
        await assert.rejects(service.remove('u1', 'a'), (err: unknown) => statusOf(err) === 404);
    });

    it('toggles an item between read and unread', async () => {
        const service = setup([item({ id: 'a' })]);
        assert.equal((await service.setStatus('u1', 'a', 'read')).status, 'read');
        assert.equal((await service.setStatus('u1', 'a', 'unread')).status, 'unread');
    });

    it('remembers where a title was added and gives more XP for advice', async () => {
        const service = setup();
        const fromAdvice = await service.add('u1', 'b1', 'advice');
        const fromCatalog = await service.add('u1', 'b2', 'catalog');
        assert.equal(fromAdvice.source, 'advice');
        assert.equal(fromCatalog.source, 'catalog');
        assert.deepEqual(service.awards, ['u1:added:b1:15', 'u1:added:b2:10']);
    });

    it('gives no XP to the student for a title a teacher adds', async () => {
        const service = setup();
        const added = await service.add('u1', 'b1', 'teacher');
        assert.equal(added.source, 'teacher');
        assert.deepEqual(service.awards, []);
    });

    it('gives XP for reading only once, also after marking it unread and read again', async () => {
        const service = setup([item({ id: 'a' })]);
        await service.setStatus('u1', 'a', 'read');
        await service.setStatus('u1', 'a', 'unread');
        await service.setStatus('u1', 'a', 'read');
        assert.deepEqual(service.awards, ['u1:read:b1:40']);
    });

    it('saves a rating with the source of the title, and shows it on the list', async () => {
        const service = setup([item({ id: 'a', status: 'read', source: 'advice' })]);
        const rated = await service.rate('u1', 'a', 4, '  Spannend!  ');
        assert.equal(rated.rating, 4);
        assert.equal(rated.comment, 'Spannend!');
        assert.equal(service.ratings[0]?.source, 'advice');
        await service.rate('u1', 'a', 5, '');
        const [entry] = await service.list('u1');
        assert.equal(entry?.rating, 5);
        assert.equal(entry?.comment, null);
        assert.deepEqual(service.awards, ['u1:rated:b1:10']);
    });

    it('only rates titles that were read, and only your own', async () => {
        const service = setup([item({ id: 'a' }), item({ id: 'b', userId: 'u2', status: 'read' })]);
        await assert.rejects(service.rate('u1', 'a', 3), (err: unknown) => statusOf(err) === 409);
        await assert.rejects(service.rate('u1', 'b', 3), (err: unknown) => statusOf(err) === 404);
    });
});
