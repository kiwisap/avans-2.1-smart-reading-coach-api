import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import nl from '../src/locales/nl.json' with { type: 'json' };
import { describeError, resolveLocale, t, tOr } from '../src/i18n.js';

function placeholders(text: string): string[] {
    return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] as string);
}

function leaves(node: unknown, path = ''): [string, string][] {
    if (typeof node === 'string') return [[path, node]];
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        leaves(value, path ? `${path}.${key}` : key),
    );
}

describe('t', () => {
    it('returns the text of a key and fills in placeholders', () => {
        assert.equal(
            t('advice.motivation.levelExact', { level: '3F' }),
            'Het is geschreven op jouw leesniveau (3F).',
        );
    });

    it('keeps a placeholder when the parameter is missing', () => {
        assert.equal(t('errors.profile.tooManyTopics'), 'Kies maximaal {{max}} onderwerpen');
    });
});

describe('tOr', () => {
    it('uses the text for a known value and the fallback for an unknown one', () => {
        assert.equal(tOr('advice.types', 'online-artikel', '?'), 'online artikel');
        assert.equal(tOr('advice.types', 'podcast', 'tekst'), 'tekst');
    });
});

describe('resolveLocale', () => {
    it('uses the default language without a header', () => {
        assert.equal(resolveLocale(undefined), 'nl');
        assert.equal(resolveLocale(''), 'nl');
    });

    it('matches on the language part and ignores the region', () => {
        assert.equal(resolveLocale('nl-BE'), 'nl');
        assert.equal(resolveLocale('NL'), 'nl');
    });

    it('skips unsupported languages and respects the q weights', () => {
        assert.equal(resolveLocale('en-US,en;q=0.9,nl;q=0.8'), 'nl');
        assert.equal(resolveLocale('fr, de;q=0.7'), 'nl');
        assert.equal(resolveLocale('nl;q=0, en'), 'nl');
        assert.equal(resolveLocale('*'), 'nl');
    });
});

describe('describeError', () => {
    it('translates the field name that belongs to a validation error', () => {
        assert.equal(
            describeError('validation.required', { field: 'email' }),
            'Het veld e-mailadres is verplicht',
        );
    });

    it('uses a neutral name for an unknown field', () => {
        assert.equal(
            describeError('validation.invalid', { field: 'iets-anders' }),
            'Het veld invoer is ongeldig',
        );
    });
});

describe('nl.json', () => {
    it('has no empty texts', () => {
        for (const [path, text] of leaves(nl)) assert.ok(text.trim().length > 0, path);
    });

    it('only uses placeholders that are written as {{name}}', () => {
        for (const [path, text] of leaves(nl)) {
            const opening = (text.match(/\{\{/g) ?? []).length;
            assert.equal(placeholders(text).length, opening, path);
        }
    });
});
