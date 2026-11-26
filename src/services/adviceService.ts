import { HttpError } from '../errors.js';
import { DEFAULT_LOCALE, t, type Locale } from '../i18n.js';
import type { AiClient, AiHistoryItem } from '../advice/aiClient.js';
import { buildReasons, buildStory, describeBook } from '../advice/motivation.js';
import { allowedLevels, scoreBook } from '../advice/scoring.js';
import type { AdviceDto } from '../dto/adviceDto.js';
import type { BookDto } from '../dto/bookDto.js';
import type { SuggestionDto } from '../dto/suggestionDto.js';
import type { ProfileData } from '../profile/profileOptions.js';
import type { BookRepository } from '../repositories/bookRepository.js';
import type { ProfileRepository } from '../repositories/profileRepository.js';
import type { ReadingListItem } from '../entities/readingListItem.js';
import type { ReadingListRepository } from '../repositories/readingListRepository.js';
import type { PeerRating, RatingRepository } from '../repositories/ratingRepository.js';
import type { SuggestionRepository } from '../repositories/suggestionRepository.js';
import type { RelatedTopics, SynonymRepository } from '../repositories/synonymRepository.js';
import { MIN_PEER_RATINGS } from '../readingList/ratings.js';

export const MIN_SUGGESTIONS = 3;
export const MAX_SUGGESTIONS = 5;

// Ratings of students like this one (same level, a shared topic) move a title up or down:
// five stars on average adds PEER_WEIGHT * 2 to the rule score, one star takes it off.
export const PEER_WEIGHT = 1.5;
// From this average Bo mentions the peer ratings as a reason.
export const PEER_PRAISE = 3.5;
// Below this average the title is left out, also when the AI model suggests it.
export const PEER_REJECT = 2;

interface Deps {
    profileRepository: Pick<ProfileRepository, 'findByUserId'>;
    bookRepository: Pick<BookRepository, 'findCandidates' | 'findByKeys' | 'findKeysByIds'>;
    readingListRepository: Pick<ReadingListRepository, 'listByUser'>;
    suggestionRepository: Pick<SuggestionRepository, 'recordShown'>;
    ratingRepository: Pick<RatingRepository, 'findForBooks' | 'peerRatings'>;
    synonymRepository: Pick<SynonymRepository, 'relatedTo'>;
    aiClient: AiClient | null;
}

export interface AdviceOptions {
    // Remember the shown titles for the statistics. Off when a teacher looks at the advice,
    // because then the student did not see it.
    record?: boolean;
}

export function createAdviceService({
    profileRepository,
    bookRepository,
    readingListRepository,
    suggestionRepository,
    ratingRepository,
    synonymRepository,
    aiClient,
}: Deps) {
    // Only peer ratings with enough votes count.
    function peerFor(peers: Map<string, PeerRating>, bookId: string): PeerRating | null {
        const peer = peers.get(bookId);
        return peer && peer.count >= MIN_PEER_RATINGS ? peer : null;
    }

    function peerReason(peer: PeerRating | null, locale: Locale): string | null {
        if (!peer || peer.average < PEER_PRAISE) return null;
        const stars = peer.average.toLocaleString(locale, { maximumFractionDigits: 1 });
        return t('advice.motivation.peers', { stars }, locale);
    }

    // Titles on the reading list (read or saved) are never suggested again, so the advice
    // changes with what the student does.
    async function findCandidates(
        profile: ProfileData,
        onList: Set<string>,
        related: RelatedTopics,
    ): Promise<BookDto[]> {
        const levels = allowedLevels(profile.languageLevel);
        const notOnList = (books: BookDto[]) => books.filter((book) => !onList.has(book.id));
        const topics = [
            ...new Set(profile.topics.flatMap((topic) => [topic, ...(related.get(topic) ?? [])])),
        ];
        const matching = notOnList(
            await bookRepository.findCandidates({
                allowedLevels: levels,
                topics,
                materialTypes: profile.materialTypes,
            }),
        );
        if (matching.length >= MIN_SUGGESTIONS) return matching;

        // Too few matches: widen to everything at the student's level so there are always enough suggestions.
        return notOnList(await bookRepository.findCandidates({ allowedLevels: levels }));
    }

    // The rule based advice (advice/scoring.ts). Always available, also without the AI service.
    async function ruleAdvice(
        profile: ProfileData,
        locale: Locale,
        onList: Set<string>,
        peers: Map<string, PeerRating>,
    ): Promise<SuggestionDto[]> {
        // Related themes come from the AI service; without them the topics match exactly.
        const related = await synonymRepository.relatedTo(profile.topics);
        const candidates = await findCandidates(profile, onList, related);

        const scored = candidates.flatMap((book) => {
            const result = scoreBook(profile, book, related);
            if (!result) return [];
            const peer = peerFor(peers, book.id);
            if (peer && peer.average < PEER_REJECT) return [];
            const bonus = peer ? (peer.average - 3) * PEER_WEIGHT : 0;
            return [{ book, peer, result: { ...result, score: result.score + bonus } }];
        });

        return scored
            .sort(
                (a, b) =>
                    b.result.score - a.result.score ||
                    a.book.title.localeCompare(b.book.title, 'nl'),
            )
            .slice(0, MAX_SUGGESTIONS)
            .map(({ book, peer, result }) => {
                const praise = peerReason(peer, locale);
                const story = buildStory(profile, book, result.reasons, locale);
                return {
                    ...book,
                    description: describeBook(book, locale),
                    motivation: praise ? `${story} ${praise}` : story,
                    reasons: [
                        ...buildReasons(profile, book, result.reasons, locale),
                        ...(praise ? [praise] : []),
                    ],
                };
            });
    }

    // The reading list tells the model what the student already knows (read or saved).
    async function readingHistory(
        userId: string,
        items: ReadingListItem[],
    ): Promise<AiHistoryItem[]> {
        const bookIds = items.map((item) => item.bookId);
        const [keys, ratings] = await Promise.all([
            bookRepository.findKeysByIds(bookIds),
            ratingRepository.findForBooks(userId, bookIds),
        ]);
        const stars = new Map(ratings.map((rating) => [rating.bookId, rating.rating]));
        return items.flatMap((item) => {
            const key = keys.get(item.bookId);
            if (!key) return [];
            const rating = stars.get(item.bookId);
            return [rating ? { key, status: item.status, rating } : { key, status: item.status }];
        });
    }

    // Advice from the AI model. Returns null when the service is missing, fails, or recommends
    // too few titles that exist in our catalog, so the caller falls back to the rules.
    async function aiAdvice(
        userId: string,
        items: ReadingListItem[],
        profile: ProfileData,
        locale: Locale,
        onList: Set<string>,
        peers: Map<string, PeerRating>,
    ): Promise<SuggestionDto[] | null> {
        if (!aiClient) return null;
        const recommendations = await aiClient.recommend(
            profile,
            await readingHistory(userId, items),
            MAX_SUGGESTIONS,
        );
        if (!recommendations) return null;

        const books = await bookRepository.findByKeys(recommendations.map((item) => item.key));
        const suggestions = recommendations.flatMap((item) => {
            const book = books.get(item.key);
            // The model leaves out the reading list itself, this also catches a title whose key
            // the model did not know.
            if (!book || onList.has(book.id)) return [];
            // Students like this one did not like it: skip, whatever the model thinks.
            const peer = peerFor(peers, book.id);
            if (peer && peer.average < PEER_REJECT) return [];
            const praise = peerReason(peer, locale);
            const story = item.motivation || item.reasons.join(' ');
            return [
                {
                    ...book,
                    description: describeBook(book, locale),
                    motivation: praise ? `${story} ${praise}` : story,
                    reasons: [...item.reasons, ...(praise ? [praise] : [])],
                },
            ];
        });
        return suggestions.length >= MIN_SUGGESTIONS ? suggestions : null;
    }

    return {
        async getAdvice(
            userId: string,
            locale: Locale = DEFAULT_LOCALE,
            { record = true }: AdviceOptions = {},
        ): Promise<AdviceDto> {
            const profile = await profileRepository.findByUserId(userId);
            if (!profile) {
                throw new HttpError(409, 'advice.profileRequired');
            }

            const [items, peers] = await Promise.all([
                readingListRepository.listByUser(userId),
                ratingRepository.peerRatings(userId, profile.languageLevel, profile.topics),
            ]);
            const onList = new Set(items.map((item) => item.bookId));

            const fromAi = await aiAdvice(userId, items, profile, locale, onList, peers);
            const advice: AdviceDto = fromAi
                ? { source: 'ai', suggestions: fromAi }
                : {
                      source: 'rules',
                      suggestions: await ruleAdvice(profile, locale, onList, peers),
                  };

            if (record) {
                await suggestionRepository.recordShown(
                    userId,
                    advice.suggestions.map((suggestion) => suggestion.id),
                    advice.source,
                );
            }
            return advice;
        },
    };
}

export type AdviceService = ReturnType<typeof createAdviceService>;
