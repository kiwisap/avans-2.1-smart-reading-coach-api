import { HttpError } from '../errors.js';
import { DEFAULT_LOCALE, type Locale } from '../i18n.js';
import type { AiClient, AiHistoryItem } from '../advice/aiClient.js';
import { buildReasons, describeBook } from '../advice/motivation.js';
import { allowedLevels, scoreBook } from '../advice/scoring.js';
import type { AdviceDto } from '../dto/adviceDto.js';
import type { BookDto } from '../dto/bookDto.js';
import type { SuggestionDto } from '../dto/suggestionDto.js';
import type { ProfileData } from '../profile/profileOptions.js';
import type { BookRepository } from '../repositories/bookRepository.js';
import type { ProfileRepository } from '../repositories/profileRepository.js';
import type { ReadingListRepository } from '../repositories/readingListRepository.js';

export const MIN_SUGGESTIONS = 3;
export const MAX_SUGGESTIONS = 5;

interface Deps {
    profileRepository: Pick<ProfileRepository, 'findByUserId'>;
    bookRepository: Pick<BookRepository, 'findCandidates' | 'findByKeys' | 'findKeysByIds'>;
    readingListRepository: Pick<ReadingListRepository, 'listByUser'>;
    aiClient: AiClient | null;
}

export function createAdviceService({
    profileRepository,
    bookRepository,
    readingListRepository,
    aiClient,
}: Deps) {
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

    // The rule based advice (advice/scoring.ts). Always available, also without the AI service.
    async function ruleAdvice(profile: ProfileData, locale: Locale): Promise<SuggestionDto[]> {
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
            .map(({ book, result }) => {
                const reasons = buildReasons(profile, book, result.reasons, locale);
                return {
                    ...book,
                    description: describeBook(book, locale),
                    motivation: reasons.join(' '),
                    reasons,
                };
            });
    }

    // The reading list tells the model what the student already knows (read or saved).
    async function readingHistory(userId: string): Promise<AiHistoryItem[]> {
        const items = await readingListRepository.listByUser(userId);
        const keys = await bookRepository.findKeysByIds(items.map((item) => item.bookId));
        return items.flatMap((item) => {
            const key = keys.get(item.bookId);
            return key ? [{ key, status: item.status }] : [];
        });
    }

    // Advice from the AI model. Returns null when the service is missing, fails, or recommends
    // too few titles that exist in our catalog, so the caller falls back to the rules.
    async function aiAdvice(
        userId: string,
        profile: ProfileData,
        locale: Locale,
    ): Promise<SuggestionDto[] | null> {
        if (!aiClient) return null;
        const recommendations = await aiClient.recommend(
            profile,
            await readingHistory(userId),
            MAX_SUGGESTIONS,
        );
        if (!recommendations) return null;

        const books = await bookRepository.findByKeys(recommendations.map((item) => item.key));
        const suggestions = recommendations.flatMap((item) => {
            const book = books.get(item.key);
            if (!book) return [];
            const reasons = item.reasons.length > 0 ? item.reasons : [item.summary];
            return [
                {
                    ...book,
                    description: describeBook(book, locale),
                    motivation: item.summary || reasons.join(' '),
                    reasons,
                },
            ];
        });
        return suggestions.length >= MIN_SUGGESTIONS ? suggestions : null;
    }

    return {
        async getAdvice(userId: string, locale: Locale = DEFAULT_LOCALE): Promise<AdviceDto> {
            const profile = await profileRepository.findByUserId(userId);
            if (!profile) {
                throw new HttpError(409, 'advice.profileRequired');
            }

            const fromAi = await aiAdvice(userId, profile, locale);
            if (fromAi) return { source: 'ai', suggestions: fromAi };

            return { source: 'rules', suggestions: await ruleAdvice(profile, locale) };
        },
    };
}

export type AdviceService = ReturnType<typeof createAdviceService>;
