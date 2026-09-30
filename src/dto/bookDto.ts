import type { Book } from '../entities/book.js';

// A catalog item as the API returns it.
export type BookDto = Omit<Book, 'key' | 'createdAt' | 'updatedAt'> & { id: string };
