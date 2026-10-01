import { HttpError } from '../errors.js';
import { DEFAULT_LOCALE, type Locale } from '../i18n.js';
import { buildMotivation, describeBook } from '../advice/motivation.js';
import { allowedLevels, scoreBook } from '../advice/scoring.js';
import type { BookDto } from '../dto/bookDto.js';
import type { SuggestionDto } from '../dto/suggestionDto.js';
import type { ProfileData } from '../profile/profileOptions.js';
import type { BookRepository } from '../repositories/bookRepository.js';
import type { ProfileRepository } from '../repositories/profileRepository.js';

export const MIN_SUGGESTIONS = 3;
export const MAX_SUGGESTIONS = 5;

interface Deps {
    profileRepository: Pick<ProfileRepository, 'findByUserId'>;
    bookRepository: Pick<BookRepository, 'findCandidates'>;
}

export function createAdviceService({ profileRepository, bookRepository }: Deps) {
    async function findCandidates(profile: ProfileData): Promise<BookDto[]> {
        const levels = allowedLevels(profile.languageLevel);
        const matching = await bookRepository.findCandidates({
            allowedLevels: levels,
            topics: profile.topics,
            materialTypes: profile.materialTypes,
        });
        if (matching.length >= MIN_SUGGESTIONS) return matching;

        // Too few matches: widen to everything at the student's level so there are always enough suggestions.
        return bookRepository.findCandidates({ allowedLevels: levels });
    }

    return {
        async getAdvice(userId: string, locale: Locale = DEFAULT_LOCALE): Promise<SuggestionDto[]> {
            const profile = await profileRepository.findByUserId(userId);
            if (!profile) {
                throw new HttpError(409, 'advice.profileRequired');
            }

            const candidates = await findCandidates(profile);

            const scored = candidates.flatMap((book) => {
                const result = scoreBook(profile, book);
                return result ? [{ book, result }] : [];
            });

            return scored
                .sort(
                    (a, b) =>
                        b.result.score - a.result.score ||
                        a.book.title.localeCompare(b.book.title, 'nl'),
                )
                .slice(0, MAX_SUGGESTIONS)
                .map(({ book, result }) => ({
                    ...book,
                    description: describeBook(book, locale),
                    motivation: buildMotivation(profile, book, result.reasons, locale),
                }));
        },
    };
}
