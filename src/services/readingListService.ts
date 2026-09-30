import type { ReadingListRow } from '../db/schema.js';
import type { Book } from '../catalog/types.js';
import { HttpError } from '../errors.js';
import type { BookRepository } from '../repositories/bookRepository.js';
import type { ReadingListRepository } from '../repositories/readingListRepository.js';
import type { ReadingStatus } from '../readingList/statuses.js';

export interface ReadingListItemDto {
    id: string;
    bookId: string;
    status: ReadingStatus;
    addedAt: Date;
    readAt: Date | null;
    book: Book | null; // null when the title was removed from the catalog
}

export function toItemDto(item: ReadingListRow, book: Book | null | undefined): ReadingListItemDto {
    return {
        id: item.id,
        bookId: item.bookId,
        status: item.status,
        addedAt: item.addedAt,
        readAt: item.readAt,
        book: book ?? null,
    };
}

interface Deps {
    readingListRepository: ReadingListRepository;
    bookRepository: Pick<BookRepository, 'findById' | 'findByIds'>;
}

export function createReadingListService({ readingListRepository, bookRepository }: Deps) {
    return {
        // Items live in PostgreSQL, book details in MongoDB, so they are combined here.
        async list(userId: string): Promise<ReadingListItemDto[]> {
            const items = await readingListRepository.listByUser(userId);
            const books = await bookRepository.findByIds(items.map((item) => item.bookId));
            const booksById = new Map(books.map((book) => [book.id, book]));

            return items
                .map((item) => toItemDto(item, booksById.get(item.bookId)))
                .sort((a, b) => {
                    if (a.status !== b.status) return a.status === 'unread' ? -1 : 1; // unread first
                    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(); // then newest first
                });
        },

        async add(userId: string, bookId: string): Promise<ReadingListItemDto> {
            const book = await bookRepository.findById(bookId);
            if (!book) throw new HttpError(404, 'This title is not in the catalog');

            const item = await readingListRepository.create(userId, bookId);
            if (!item) throw new HttpError(409, 'This title is already on your reading list');
            return toItemDto(item, book);
        },

        async setStatus(
            userId: string,
            id: string,
            status: ReadingStatus,
        ): Promise<ReadingListItemDto> {
            const item = await readingListRepository.updateStatus(userId, id, status);
            if (!item) throw new HttpError(404, 'Reading list item not found');
            const book = await bookRepository.findById(item.bookId);
            return toItemDto(item, book);
        },

        async remove(userId: string, id: string): Promise<void> {
            const removed = await readingListRepository.remove(userId, id);
            if (!removed) throw new HttpError(404, 'Reading list item not found');
        },
    };
}

export type ReadingListService = ReturnType<typeof createReadingListService>;
