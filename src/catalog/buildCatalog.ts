import type { Book } from '../entities/book.js';
import { normalizeRow } from './normalizeRow.js';
import type { SheetRow } from './readCatalogSheet.js';

export interface CatalogBuild {
    books: Book[];
    duplicates: string[]; // rows that repeat a title already in the catalog
    warnings: string[];
}

// Turns the spreadsheet rows into catalog items, one per key. A row that repeats a title is not
// shown twice in the app, but its spreadsheet row is kept in `sources`, because the AI dataset
// refers to it with its own catalog code.
export function buildCatalog(rows: SheetRow[]): CatalogBuild {
    const booksByKey = new Map<string, Book>();
    const duplicates: string[] = [];
    const warnings: string[] = [];

    for (const { rowNumber, cells, source } of rows) {
        const result = normalizeRow(cells);
        if (!result) continue;
        for (const warning of result.warnings) {
            warnings.push(`row ${rowNumber} (${result.doc.title}): ${warning}`);
        }
        const existing = booksByKey.get(result.doc.key);
        if (existing) {
            existing.sources = [...(existing.sources ?? []), source];
            duplicates.push(`row ${rowNumber} (${result.doc.title})`);
            continue;
        }
        booksByKey.set(result.doc.key, { ...result.doc, sources: [source] });
    }

    return { books: [...booksByKey.values()], duplicates, warnings };
}
