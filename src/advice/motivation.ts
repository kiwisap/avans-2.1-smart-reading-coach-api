import type { Book } from '../catalog/types.js';
import type { ProfileData, ReadingGoal } from '../profile/profileOptions.js';
import type { MatchReasons } from './scoring.js';

const TYPE_NAMES: Record<string, string> = {
    boek: 'book',
    'online-artikel': 'online article',
    blogpost: 'blog post',
    dichtbundel: 'poetry collection',
    tijdschrift: 'magazine',
    krant: 'newspaper',
};

const GOAL_TEXT: Record<ReadingGoal, string> = {
    enjoyment: 'A good pick for reading for fun.',
    learn: 'A good pick for learning something new.',
    language: 'A good pick for practising your language skills.',
    work: 'Useful for work or study.',
};

// "Why this fits you": built only from the reasons that actually matched.
export function buildMotivation(
    profile: ProfileData,
    book: Pick<Book, 'type'>,
    reasons: MatchReasons,
): string {
    const parts: string[] = [];

    if (reasons.topics.length > 0)
        parts.push(`It covers your topics: ${reasons.topics.join(', ')}.`);
    if (reasons.level === 'exact') {
        parts.push(`It is written at your reading level (${profile.languageLevel}).`);
    } else if (reasons.level === 'easier') {
        parts.push(
            `It is a bit easier than your level (${profile.languageLevel}), so it reads comfortably.`,
        );
    }
    if (reasons.materialType) {
        parts.push(
            `It is a ${TYPE_NAMES[book.type] ?? book.type}, one of the kinds of texts you like.`,
        );
    }
    if (reasons.length)
        parts.push(`Its length suits your wish for a ${profile.desiredLength} text.`);
    if (reasons.goal) parts.push(GOAL_TEXT[profile.readingGoal]);

    return parts.length > 0 ? parts.join(' ') : 'A solid option at your reading level.';
}

// Not every catalog item has a description (articles and poetry only have themes).
export function describeBook(
    book: Pick<Book, 'type' | 'author' | 'themes' | 'description'>,
): string {
    if (book.description) return book.description;
    const kind = TYPE_NAMES[book.type] ?? 'text';
    const by = book.author ? ` by ${book.author}` : '';
    const about = book.themes?.length ? ` about ${book.themes.join(', ')}` : '';
    return `A ${kind}${by}${about}.`;
}
