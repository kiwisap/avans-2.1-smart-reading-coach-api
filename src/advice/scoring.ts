import type { BookDto } from '../dto/bookDto.js';
import {
    LANGUAGE_LEVELS,
    type DesiredLength,
    type LanguageLevel,
    type MaterialType,
    type ProfileData,
    type ReadingGoal,
} from '../profile/profileOptions.js';

// How much each match is worth. Kept in one place so the matching is easy to explain and tune.
export const WEIGHTS = {
    levelExact: 3,
    levelEasier: 1,
    perTopic: 3,
    materialType: 2,
    length: 1,
    goal: 1,
} as const;

// The catalog has no page count, so length is estimated from the kind of text.
const LENGTHS_BY_TYPE: Record<MaterialType, DesiredLength[]> = {
    boek: ['medium', 'long'],
    dichtbundel: ['short', 'medium'],
    tijdschrift: ['medium'],
    krant: ['short'],
    'online-artikel': ['short'],
    blogpost: ['short'],
};

const TYPES_BY_GOAL: Record<ReadingGoal, MaterialType[]> = {
    enjoyment: ['boek', 'dichtbundel'],
    learn: ['online-artikel', 'blogpost', 'tijdschrift', 'krant'],
    language: ['krant', 'tijdschrift', 'blogpost'],
    work: ['online-artikel', 'blogpost'],
};

export interface MatchReasons {
    level: 'exact' | 'easier' | 'unknown';
    topics: string[];
    materialType: boolean;
    length: boolean;
    goal: boolean;
}

export interface ScoreResult {
    score: number;
    reasons: MatchReasons;
}

// The part of a book the scoring needs.
export type ScorableBook = Pick<BookDto, 'levels' | 'themes' | 'type'>;

const rank = (level: LanguageLevel): number => LANGUAGE_LEVELS.indexOf(level);

// Levels a student can read: their own level and everything easier.
export function allowedLevels(profileLevel: LanguageLevel): LanguageLevel[] {
    return LANGUAGE_LEVELS.slice(0, rank(profileLevel) + 1);
}

// Returns null when the book is too difficult, otherwise the score and why it matched.
export function scoreBook(profile: ProfileData, book: ScorableBook): ScoreResult | null {
    const bookLevels = book.levels ?? [];
    const easiest = Math.min(...bookLevels.map(rank));
    if (bookLevels.length > 0 && easiest > rank(profile.languageLevel)) return null;

    let score = 0;
    const reasons: MatchReasons = {
        level: 'unknown',
        topics: [],
        materialType: false,
        length: false,
        goal: false,
    };

    if (bookLevels.includes(profile.languageLevel)) {
        reasons.level = 'exact';
        score += WEIGHTS.levelExact;
    } else if (bookLevels.length > 0) {
        reasons.level = 'easier';
        score += WEIGHTS.levelEasier;
    }

    reasons.topics = (book.themes ?? []).filter((theme) => profile.topics.includes(theme));
    score += reasons.topics.length * WEIGHTS.perTopic;

    if (profile.materialTypes.includes(book.type)) {
        reasons.materialType = true;
        score += WEIGHTS.materialType;
    }

    if (LENGTHS_BY_TYPE[book.type]?.includes(profile.desiredLength)) {
        reasons.length = true;
        score += WEIGHTS.length;
    }

    if (TYPES_BY_GOAL[profile.readingGoal]?.includes(book.type)) {
        reasons.goal = true;
        score += WEIGHTS.goal;
    }

    return { score, reasons };
}
