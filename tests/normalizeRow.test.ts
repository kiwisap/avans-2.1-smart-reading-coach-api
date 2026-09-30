import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildKey, normalizeRow, parseLevels, parseUrl } from '../src/catalog/normalizeRow.js';

// Small helper: most tests expect a real row, so fail loudly when the result is null.
function normalize(row: string[]) {
    const result = normalizeRow(row);
    assert.ok(result, 'expected the row to produce a catalog item');
    return result;
}

describe('normalizeRow', () => {
    it('maps a book row: description in column 3, themes in column 7', () => {
        const { doc, warnings } = normalize([
            'Blauw Water',
            'S. van der Vlugt',
            'Spannende thriller.',
            '',
            'Boek',
            '3F',
            'spanning;stalking',
        ]);
        assert.equal(doc.type, 'boek');
        assert.equal(doc.description, 'Spannende thriller.');
        assert.deepEqual(doc.themes, ['spanning', 'stalking']);
        assert.deepEqual(doc.levels, ['3F']);
        assert.deepEqual(warnings, []);
    });

    it('splits "boek - thriller" into type and genre', () => {
        const { doc } = normalize(['X', 'Y', 'd', '', 'boek - thriller', '2F', 'a']);
        assert.equal(doc.type, 'boek');
        assert.equal(doc.genre, 'thriller');
    });

    it('maps an article row: themes in column 3, URL in column 7', () => {
        const { doc } = normalize([
            'Wat is een rechtsstaat?',
            'ProDemos',
            'Rechtsstaat, grondrechten',
            '',
            'online artikel',
            '2F-3F',
            'https://prodemos.nl/x [prodemos.nl]',
        ]);
        assert.equal(doc.type, 'online-artikel');
        assert.equal(doc.description, null);
        assert.deepEqual(doc.themes, ['rechtsstaat', 'grondrechten']);
        assert.deepEqual(doc.levels, ['2F', '3F']);
        assert.equal(doc.url, 'https://prodemos.nl/x');
    });

    it('skips rows without a title', () => {
        assert.equal(normalizeRow(['', '', '', '', '', '', '']), null);
    });

    it('warns about a missing type and level instead of failing', () => {
        const { doc, warnings } = normalize(['Titel', 'Auteur', 'omschrijving', '', '', '', '']);
        assert.equal(doc.type, 'boek');
        assert.equal(doc.author, 'Auteur');
        assert.deepEqual(doc.levels, []);
        assert.equal(warnings.length, 2);
    });

    it('warns about an unknown level', () => {
        const { warnings } = normalize(['T', 'A', 'd', '', 'boek', '9Z', '']);
        assert.ok(warnings.some((warning) => warning.includes('unknown level')));
    });
});

describe('helpers', () => {
    it('parseLevels handles ranges and plus levels', () => {
        assert.deepEqual(parseLevels('3F+').levels, ['3F+']);
        assert.deepEqual(parseLevels('2F-3F').levels, ['2F', '3F']);
    });

    it('parseUrl rejects non URLs', () => {
        assert.equal(parseUrl('niet een url'), null);
    });

    it('buildKey ignores case and accents so duplicates collapse', () => {
        assert.equal(
            buildKey({ title: 'Café  Noir', author: 'X', type: 'boek' }),
            buildKey({ title: 'cafe noir', author: 'x', type: 'boek' }),
        );
    });
});
