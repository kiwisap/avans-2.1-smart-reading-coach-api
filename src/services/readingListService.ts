import type { ReadingListItemDto } from '../dto/readingListItemDto.js';
import { HttpError } from '../errors.js';
import type { BookRepository } from '../repositories/bookRepository.js';
import { XP_REWARDS } from '../progress/xp.js';
import type { ReadingListRepository } from '../repositories/readingListRepository.js';
import type { RatingRepository } from '../repositories/ratingRepository.js';
import type { XpRepository } from '../repositories/xpRepository.js';
import { MAX_COMMENT_LENGTH } from '../readingList/ratings.js';
import type { ReadingListSource } from '../readingList/sources.js';
import type { ReadingStatus } from '../readingList/statuses.js';
import { toReadingListItemDto } from './mappingService.js';

interface Deps {
    readingListRepository: ReadingListRepository;
    bookRepository: Pick<BookRepository, 'findById' | 'findByIds'>;
    xpRepository: Pick<XpRepository, 'award'>;
    ratingRepository: Pick<RatingRepository, 'findForBooks' | 'upsert'>;
}

export function createReadingListService({
    readingListRepository,
    bookRepository,
    xpRepository,
    ratingRepository,
}: Deps) {
    return {
        // Items live in PostgreSQL, book details in MongoDB, so they are combined here.
        async list(userId: string): Promise<ReadingListItemDto[]> {
            const items = await readingListRepository.listByUser(userId);
            const bookIds = items.map((item) => item.bookId);
            const [books, ratings] = await Promise.all([
                bookRepository.findByIds(bookIds),
                ratingRepository.findForBooks(userId, bookIds),
            ]);
            const booksById = new Map(books.map((book) => [book.id, book]));
            const ratingsByBook = new Map(ratings.map((rating) => [rating.bookId, rating]));

            return items
                .map((item) =>
                    toReadingListItemDto(
                        item,
                        booksById.get(item.bookId),
                        ratingsByBook.get(item.bookId),
                    ),
                )
                .sort((a, b) => {
                    if (a.status !== b.status) return a.status === 'unread' ? -1 : 1; // unread first
                    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(); // then newest first
                });
        },

        async add(
            userId: string,
            bookId: string,
            source: ReadingListSource,
        ): Promise<ReadingListItemDto> {
            const book = await bookRepository.findById(bookId);
            if (!book) throw new HttpError(404, 'readingList.bookNotInCatalog');

            const item = await readingListRepository.create(userId, bookId, source);
            if (!item) throw new HttpError(409, 'readingList.alreadyOnList');

            // XP only for what the student does, not for titles a teacher adds.
            if (source !== 'teacher') {
                const xp = source === 'advice' ? XP_REWARDS.addedFromAdvice : XP_REWARDS.added;
                await xpRepository.award(userId, 'added', bookId, xp);
            }
            return toReadingListItemDto(item, book);
        },

        async setStatus(
            userId: string,
            id: string,
            status: ReadingStatus,
        ): Promise<ReadingListItemDto> {
            const item = await readingListRepository.updateStatus(userId, id, status);
            if (!item) throw new HttpError(404, 'readingList.itemNotFound');
            if (status === 'read') {
                await xpRepository.award(userId, 'read', item.bookId, XP_REWARDS.read);
            }
            const [book, [rating]] = await Promise.all([
                bookRepository.findById(item.bookId),
                ratingRepository.findForBooks(userId, [item.bookId]),
            ]);
            return toReadingListItemDto(item, book, rating);
        },

        // What the student thought of a title they read. Asked by Bo after marking it read.
        async rate(
            userId: string,
            id: string,
            rating: number,
            comment?: string | null,
        ): Promise<ReadingListItemDto> {
            const item = await readingListRepository.findById(userId, id);
            if (!item) throw new HttpError(404, 'readingList.itemNotFound');
            if (item.status !== 'read') throw new HttpError(409, 'readingList.rateAfterReading');

            const text = comment?.trim().slice(0, MAX_COMMENT_LENGTH) || null;
            const saved = await ratingRepository.upsert(
                userId,
                item.bookId,
                rating,
                text,
                item.source,
            );
            await xpRepository.award(userId, 'rated', item.bookId, XP_REWARDS.rated);
            const book = await bookRepository.findById(item.bookId);
            return toReadingListItemDto(item, book, saved);
        },

        async remove(userId: string, id: string): Promise<void> {
            const removed = await readingListRepository.remove(userId, id);
            if (!removed) throw new HttpError(404, 'readingList.itemNotFound');
        },
    };
}

export type ReadingListService = ReturnType<typeof createReadingListService>;
