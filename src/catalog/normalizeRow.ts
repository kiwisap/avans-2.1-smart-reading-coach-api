// Turns one raw spreadsheet row into a catalog document.
// The sheet mixes formats: for books, column 3 is the description and column 7 the themes,
// for articles, blogposts and poetry, column 3 holds the themes and column 7 the URL.
import {
    LANGUAGE_LEVELS,
    type LanguageLevel,
    type MaterialType,
} from '../profile/profileOptions.js';
import type { CatalogItem } from './types.js';

interface TypeMapping {
    type: MaterialType;
    genre?: string;
    format?: string;
}

const TYPE_MAP: Record<string, TypeMapping> = {
    boek: { type: 'boek' },
    'boek - thriller': { type: 'boek', genre: 'thriller' },
    'boek - roman': { type: 'boek', genre: 'roman' },
    'online artikel': { type: 'online-artikel' },
    blogpost: { type: 'blogpost' },
    dichtbundel: { type: 'dichtbundel' },
    tijdschrift: { type: 'tijdschrift' },
    'krant (papier)': { type: 'krant', format: 'papier' },
    'digitale krant': { type: 'krant', format: 'digitaal' },
};

// For these types the "Korte omschrijving" column contains themes, not a description.
const THEMES_IN_DESCRIPTION_COLUMN = new Set<MaterialType>([
    'online-artikel',
    'blogpost',
    'dichtbundel',
]);

function clean(value: unknown): string {
    return value == null ? '' : String(value).trim();
}

function slug(value: unknown): string {
    return clean(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function isLevel(value: string): value is LanguageLevel {
    return (LANGUAGE_LEVELS as readonly string[]).includes(value);
}

export function parseThemes(raw: unknown): string[] {
    const seen = new Set<string>();
    for (const part of clean(raw).split(/[;,]/)) {
        const theme = part.trim().toLowerCase();
        if (theme) seen.add(theme);
    }
    return [...seen];
}

export function parseLevels(raw: unknown): {
    levels: LanguageLevel[];
    levelLabel: string | null;
    invalid: boolean;
} {
    const label = clean(raw).toUpperCase();
    if (!label) return { levels: [], levelLabel: null, invalid: false };
    const parts = label.split('-').map((part) => part.trim());
    return {
        levels: parts.filter(isLevel),
        levelLabel: label,
        invalid: parts.some((part) => !isLevel(part)),
    };
}

export function parseUrl(raw: unknown): string | null {
    // The sheet has values like "https://example.nl/page [example.nl]", keep only the URL.
    const url = clean(raw).replace(/\s*\[[^\]]*\]\s*$/, '');
    return /^https?:\/\//i.test(url) ? url : null;
}

export function buildKey(item: {
    title: string;
    author: string | null;
    type: MaterialType;
}): string {
    return [slug(item.title), slug(item.author), item.type].join('|');
}

// row: [title, author, column3, (unused), type, level, column7]
// Returns null for empty rows, otherwise { doc, warnings }.
export function normalizeRow(row: string[]): { doc: CatalogItem; warnings: string[] } | null {
    const [rawTitle, rawAuthor, column3, , rawType, rawLevel, column7] = row;
    const title = clean(rawTitle);
    if (!title) return null;

    const warnings: string[] = [];

    let mapped = TYPE_MAP[clean(rawType).toLowerCase()];
    if (!mapped) {
        if (clean(rawType)) warnings.push(`unknown type "${clean(rawType)}", assumed boek`);
        else warnings.push('type missing, assumed boek');
        mapped = { type: 'boek' };
    }

    const { levels, levelLabel, invalid } = parseLevels(rawLevel);
    if (invalid) warnings.push(`unknown level "${levelLabel}"`);
    if (!levelLabel) warnings.push('level missing');

    const themesInDescription = THEMES_IN_DESCRIPTION_COLUMN.has(mapped.type);
    const author = clean(rawAuthor) || null;

    const doc: CatalogItem = {
        key: buildKey({ title, author, type: mapped.type }),
        title,
        author,
        type: mapped.type,
        genre: mapped.genre ?? null,
        format: mapped.format ?? null,
        description: themesInDescription ? null : clean(column3) || null,
        themes: parseThemes(themesInDescription ? column3 : column7),
        levels,
        levelLabel,
        url: themesInDescription ? parseUrl(column7) : null,
    };

    return { doc, warnings };
}
