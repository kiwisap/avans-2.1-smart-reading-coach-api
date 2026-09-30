import type { BookDto } from './bookDto.js';

export type SuggestionDto = BookDto & { motivation: string };
