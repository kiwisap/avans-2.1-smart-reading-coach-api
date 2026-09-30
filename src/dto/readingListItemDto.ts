import type { ReadingStatus } from '../readingList/statuses.js';
import type { BookDto } from './bookDto.js';

export interface ReadingListItemDto {
    id: string;
    bookId: string;
    status: ReadingStatus;
    addedAt: Date;
    readAt: Date | null;
    book: BookDto | null; // null when the title was removed from the catalog
}
