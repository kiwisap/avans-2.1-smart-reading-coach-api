import nl from './locales/nl.json' with { type: 'json' };

// All texts the backend itself produces (error messages, advice motivation) live in
// src/locales/<language>.json. To add a language: add a json file with the same keys here.
const catalogs = { nl } as const;

export type Locale = keyof typeof catalogs;
export const DEFAULT_LOCALE: Locale = 'nl';

const isLocale = (value: string): value is Locale => value in catalogs;

// Picks the best supported language from an Accept-Language header such as
// "en-US,en;q=0.9,nl;q=0.8". Only the language part counts ("nl-BE" gives "nl"). When nothing
// matches, or there is no header, the default language is used.
export function resolveLocale(header: string | undefined): Locale {
    const candidates = (header ?? '')
        .split(',')
        .map((part, index) => {
            const [range = '', ...rest] = part.trim().split(';');
            const q = rest.map((p) => p.trim()).find((p) => p.startsWith('q='));
            const weight = q ? Number(q.slice(2)) : 1;
            return {
                language: range.trim().toLowerCase().split('-')[0] ?? '',
                weight: Number.isNaN(weight) ? 0 : weight,
                index,
            };
        })
        .filter((c) => c.weight > 0)
        .sort((a, b) => b.weight - a.weight || a.index - b.index);
    return (
        (candidates.find((c) => isLocale(c.language))?.language as Locale | undefined) ??
        DEFAULT_LOCALE
    );
}

// "errors.auth.emailTaken" style paths of all texts, derived from the json so a typo does not compile.
type Leaves<T, Prefix extends string = ''> = {
    [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof nl>;

// The code of an API error, for example "auth.emailTaken": the path below "errors".
export type ErrorCode = Leaves<(typeof nl)['errors']>;

export type MessageParams = Record<string, string | number>;

function lookup(locale: Locale, key: string): string | undefined {
    let node: unknown = catalogs[locale];
    for (const part of key.split('.')) {
        if (typeof node !== 'object' || node === null) return undefined;
        node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : undefined;
}

function fill(text: string, params: MessageParams = {}): string {
    return text.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
        name in params ? String(params[name]) : placeholder,
    );
}

// Returns the text for a key with {{placeholders}} filled in.
export function t(
    key: MessageKey,
    params?: MessageParams,
    locale: Locale = DEFAULT_LOCALE,
): string {
    return fill(lookup(locale, key) ?? key, params);
}

// For values that come from data (a book type from the database): the text when there is one,
// otherwise the fallback, so unknown values never break a response.
export function tOr(
    group: 'advice.types' | 'advice.lengths' | 'advice.goals',
    value: string,
    fallback: string,
    locale: Locale = DEFAULT_LOCALE,
): string {
    return lookup(locale, `${group}.${value}`) ?? fallback;
}

// The human readable message of an error code. A "field" parameter is the field name in the
// request (for example "email") and is shown in the language of the message.
export function describeError(
    code: ErrorCode,
    params?: MessageParams,
    locale: Locale = DEFAULT_LOCALE,
): string {
    const shown = { ...params };
    if (typeof shown.field === 'string') {
        shown.field =
            lookup(locale, `fields.${shown.field}`) ?? lookup(locale, 'fields.input') ?? '';
    }
    return fill(lookup(locale, `errors.${code}`) ?? code, shown);
}
