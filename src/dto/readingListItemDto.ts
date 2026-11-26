import type { ReadingListSource } from '../readingList/sources.js';
import type { ReadingStatus } from '../readingList/statuses.js';
import type { BookDto } from './bookDto.js';

export interface ReadingListItemDto {
    id: string;
    bookId: string;
    status: ReadingStatus;
    addedAt: Date;
    readAt: Date | null;
    source: ReadingListSource | null; // null for titles added before the source was tracked
    rating: number | null; // 1 to 5 stars the student gave after reading, null when not rated
    comment: string | null;
    book: BookDto | null; // null when the title was removed from the catalog
}
