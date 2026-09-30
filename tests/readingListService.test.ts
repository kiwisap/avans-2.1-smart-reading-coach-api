import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Book } from '../src/catalog/types.js';
import type { ReadingListRow } from '../src/db/schema.js';
import type { ReadingStatus } from '../src/readingList/statuses.js';
import { createReadingListService } from '../src/services/readingListService.js';

const makeBook = (id: string, title: string): Book => ({
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

const books: Record<string, Book> = {
    b1: makeBook('b1', 'Boek 1'),
    b2: makeBook('b2', 'Boek 2'),
};

const item = (overrides: Partial<ReadingListRow> = {}): ReadingListRow => ({
    id: 'x',
    userId: 'u1',
    bookId: 'b1',
    status: 'unread',
    addedAt: new Date('2026-01-01'),
    readAt: null,
    ...overrides,
});

function setup(initialItems: ReadingListRow[] = []) {
    const items = [...initialItems];
    const readingListRepository = {
        listByUser: async (userId: string) => items.filter((i) => i.userId === userId),
        create: async (userId: string, bookId: string) => {
            if (items.some((i) => i.userId === userId && i.bookId === bookId)) return null;
            const created = item({
                id: `i${items.length + 1}`,
                userId,
                bookId,
                addedAt: new Date(),
            });
            items.push(created);
            return created;
        },
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
    return createReadingListService({ readingListRepository, bookRepository });
}

const statusOf = (err: unknown) => (err as { statusCode?: number }).statusCode;

describe('readingListService', () => {
    it('adds a catalog title and returns it with book details', async () => {
        const service = setup();
        const added = await service.add('u1', 'b1');
        assert.equal(added.status, 'unread');
        assert.equal(added.book?.title, 'Boek 1');
    });

    it('rejects a title that is not in the catalog', async () => {
        await assert.rejects(setup().add('u1', 'nope'), (err: unknown) => statusOf(err) === 404);
    });

    it('rejects adding the same title twice', async () => {
        const service = setup();
        await service.add('u1', 'b1');
        await assert.rejects(service.add('u1', 'b1'), (err: unknown) => statusOf(err) === 409);
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
});
