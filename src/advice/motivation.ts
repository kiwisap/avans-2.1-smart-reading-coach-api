import type { BookDto } from '../dto/bookDto.js';
import { DEFAULT_LOCALE, t, tOr, type Locale } from '../i18n.js';
import type { ProfileData } from '../profile/profileOptions.js';
import type { MatchReasons } from './scoring.js';

// "Waarom dit bij je past": only built from the reasons that actually matched.
// The texts live in src/locales/nl.json, under "advice".

type StoryBook = Pick<BookDto, 'id' | 'type' | 'levels'> & Partial<Pick<BookDto, 'levelLabel'>>;

const typeLabel = (type: string, locale: Locale): string => tOr('advice.types', type, type, locale);

// "vriendschap", "vriendschap en sport", "vriendschap, sport en humor".
function joinList(items: string[], locale: Locale): string {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
}

// The same book always gets the same wording, while different books get some variation.
function pick<T>(seed: string, options: readonly T[]): T {
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return options[hash % options.length] as T;
}

// The separate reasons, for the teacher view and as data for the frontend.
export function buildReasons(
    profile: ProfileData,
    book: Pick<BookDto, 'type'>,
    reasons: MatchReasons,
    locale: Locale = DEFAULT_LOCALE,
): string[] {
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
            t('advice.motivation.materialType', { type: typeLabel(book.type, locale) }, locale),
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
        const goal = tOr('advice.goals', profile.readingGoal, '', locale);
        if (goal) parts.push(goal);
    }

    return parts.length > 0 ? parts : [t('advice.motivation.fallback', undefined, locale)];
}

// The opening: why the student would want to read this at all.
function opening(
    profile: ProfileData,
    book: StoryBook,
    reasons: MatchReasons,
    locale: Locale,
): string {
    if (reasons.topics.length > 0) {
        const topics = joinList(reasons.topics, locale);
        const key = pick(book.id, [
            'advice.story.openTopics',
            'advice.story.openTopicsAlt',
        ] as const);
        return t(key, { topics }, locale);
    }
    if (reasons.goal) {
        const goal = tOr('advice.story.goals', profile.readingGoal, '', locale);
        if (goal) return goal;
    }
    return t('advice.story.openFallback', undefined, locale);
}

// The middle: what kind of text it is, how hard it is and whether the length fits.
function middle(
    profile: ProfileData,
    book: StoryBook,
    reasons: MatchReasons,
    locale: Locale,
): string {
    const type = typeLabel(book.type, locale);
    const bookLevel = book.levelLabel ?? book.levels.join(', ');
    let sentence: string;
    if (reasons.level === 'exact') {
        sentence = t('advice.story.levelExact', { type, level: profile.languageLevel }, locale);
    } else if (reasons.level === 'easier') {
        sentence = t(
            'advice.story.levelEasier',
            { type, bookLevel, level: profile.languageLevel },
            locale,
        );
    } else {
        sentence = t('advice.story.levelUnknown', { type }, locale);
    }
    if (reasons.length) {
        const length = tOr('advice.lengths', profile.desiredLength, profile.desiredLength, locale);
        return sentence + t('advice.story.lengthFits', { length }, locale);
    }
    return `${sentence}.`;
}

// The closing: an extra reason that was not used in the opening.
function closing(profile: ProfileData, reasons: MatchReasons, locale: Locale): string | null {
    if (reasons.topics.length > 0 && reasons.goal) {
        const goal = tOr('advice.goals', profile.readingGoal, '', locale);
        if (goal) return goal;
    }
    if (reasons.materialType) return t('advice.story.closeType', undefined, locale);
    return null;
}

// Bo's short story about why a book fits, built from the same reasons as buildReasons.
export function buildStory(
    profile: ProfileData,
    book: StoryBook,
    reasons: MatchReasons,
    locale: Locale = DEFAULT_LOCALE,
): string {
    return [
        opening(profile, book, reasons, locale),
        middle(profile, book, reasons, locale),
        closing(profile, reasons, locale),
    ]
        .filter((part): part is string => Boolean(part))
        .join(' ');
}

// Not every item in the catalog has a description (articles and poetry only have themes).
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
