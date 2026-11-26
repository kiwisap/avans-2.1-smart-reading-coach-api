import type { Book } from '../entities/book.js';

// A catalog item as the API returns it. The imported spreadsheet rows stay internal.
export type BookDto = Omit<Book, 'key' | 'sources' | 'createdAt' | 'updatedAt'> & {
    id: string;
};
