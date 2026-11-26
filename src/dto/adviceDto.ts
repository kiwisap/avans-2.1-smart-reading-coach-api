import type { AdviceSource } from '../advice/sources.js';
import type { SuggestionDto } from './suggestionDto.js';

export interface AdviceDto {
    source: AdviceSource;
    suggestions: SuggestionDto[];
}
