import type { BookDto } from '../dto/bookDto.js';
import { DEFAULT_LOCALE, t, tOr, type Locale } from '../i18n.js';
import type { ProfileData } from '../profile/profileOptions.js';
import type { MatchReasons } from './scoring.js';

// "Waarom dit bij je past": alleen opgebouwd uit de redenen die echt overeenkomen.
// The texts live in src/locales/nl.json, under "advice".
export function buildMotivation(
    profile: ProfileData,
    book: Pick<BookDto, 'type'>,
    reasons: MatchReasons,
    locale: Locale = DEFAULT_LOCALE,
): string {
    const parts: string[] = [];

    if (reasons.topics.length > 0) {
        parts.push(t('advice.motivation.topics', { topics: reasons.topics.join(', ') }, locale));
    }
    if (reasons.level === 'exact') {
        parts.push(t('advice.motivation.levelExact', { level: profile.languageLevel }, locale));
    } else if (reasons.level === 'easier') {
        parts.push(t('advice.motivation.levelEasier', { level: profile.languageLevel }, locale));
    }
    if (reasons.materialType) {
        parts.push(
            t(
                'advice.motivation.materialType',
                { type: tOr('advice.types', book.type, book.type, locale) },
                locale,
            ),
        );
    }
    if (reasons.length) {
        parts.push(
            t(
                'advice.motivation.length',
                {
                    length: tOr(
                        'advice.lengths',
                        profile.desiredLength,
                        profile.desiredLength,
                        locale,
                    ),
                },
                locale,
            ),
        );
    }
    if (reasons.goal) {
        parts.push(tOr('advice.goals', profile.readingGoal, '', locale));
    }

    return parts.length > 0 ? parts.join(' ') : t('advice.motivation.fallback', undefined, locale);
}

// Niet elk item in de catalogus heeft een beschrijving (artikelen en poëzie hebben alleen thema's).
export function describeBook(
    book: Pick<BookDto, 'type' | 'author' | 'themes' | 'description'>,
    locale: Locale = DEFAULT_LOCALE,
): string {
    if (book.description) return book.description;
    return t(
        'advice.description.sentence',
        {
            kind: tOr(
                'advice.types',
                book.type,
                t('advice.description.kindFallback', undefined, locale),
                locale,
            ),
            by: book.author ? t('advice.description.by', { author: book.author }, locale) : '',
            about: book.themes?.length
                ? t('advice.description.about', { themes: book.themes.join(', ') }, locale)
                : '',
        },
        locale,
    );
}
