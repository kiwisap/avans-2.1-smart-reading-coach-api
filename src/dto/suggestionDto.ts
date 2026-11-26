import type { BookDto } from './bookDto.js';

// A recommended title. `reasons` are the separate reasons, `motivation` is the short summary.
export type SuggestionDto = BookDto & { motivation: string; reasons: string[] };
