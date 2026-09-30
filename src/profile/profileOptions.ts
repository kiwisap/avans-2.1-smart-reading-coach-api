// Single source of truth for the reading profile answers.
// Language levels and material types mirror the catalog metadata, so profile and catalog filters match.
export const LANGUAGE_LEVELS = ['2F', '3F', '3F+'] as const;
export const MATERIAL_TYPES = [
    'boek',
    'online-artikel',
    'blogpost',
    'dichtbundel',
    'tijdschrift',
    'krant',
] as const;
export const DESIRED_LENGTHS = ['short', 'medium', 'long'] as const;
export const READING_GOALS = ['enjoyment', 'learn', 'language', 'work'] as const;
export const MAX_TOPICS = 5;

export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type DesiredLength = (typeof DESIRED_LENGTHS)[number];
export type ReadingGoal = (typeof READING_GOALS)[number];

// The answers a student gives in the reading profile.
export interface ProfileData {
    languageLevel: LanguageLevel;
    materialTypes: MaterialType[];
    topics: string[];
    desiredLength: DesiredLength;
    readingGoal: ReadingGoal;
}
