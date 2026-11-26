import type { BookDto } from './bookDto.js';

// A recommended title. `motivation` is Bo's short story about why it fits, `reasons` are the separate reasons behind it.
export type SuggestionDto = BookDto & { motivation: string; reasons: string[] };
