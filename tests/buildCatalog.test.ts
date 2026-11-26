import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCatalog } from '../src/catalog/buildCatalog.js';
import { readCatalogSheet, type SheetRow } from '../src/catalog/readCatalogSheet.js';

const row = (rowNumber: number, title: string, code: string): SheetRow => ({
    rowNumber,
    cells: [title, 'A. Auteur', 'Een verhaal.', '', 'Boek', '2F', 'vriendschap'],
    source: { Titel: title, cataloguscode: code, aantal_paginas: '120' },
});

describe('buildCatalog', () => {
    it('keeps the full spreadsheet row next to the catalog item', () => {
        const { books } = buildCatalog([row(2, 'Eerste boek', 'CAT-1')]);
        assert.equal(books.length, 1);
        assert.deepEqual(books[0]?.sources, [
            { Titel: 'Eerste boek', cataloguscode: 'CAT-1', aantal_paginas: '120' },
        ]);
    });

    it('shows a repeated title once but keeps both rows for the AI dataset', () => {
        const { books, duplicates } = buildCatalog([
            row(2, 'Zelfde boek', 'CAT-1'),
            row(3, 'Zelfde boek', 'CAT-2'),
        ]);
        assert.equal(books.length, 1);
        assert.deepEqual(
            books[0]?.sources?.map((source) => source.cataloguscode),
            ['CAT-1', 'CAT-2'],
        );
        assert.deepEqual(duplicates, ['row 3 (Zelfde boek)']);
    });

    it('reads every column of the real catalog, so nothing the model uses is lost', async () => {
        const rows = await readCatalogSheet('data/leescatalogus.xlsx');
        const { books } = buildCatalog(rows);
        const sources = books.flatMap((book) => book.sources ?? []);
        assert.equal(sources.length, rows.length);
        assert.ok(sources.every((source) => source.cataloguscode));
        assert.ok(sources.some((source) => source.leescomplexiteit_score));
    });
});
