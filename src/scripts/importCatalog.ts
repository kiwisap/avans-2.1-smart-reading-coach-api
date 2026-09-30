import { MongoClient } from 'mongodb';
import { normalizeRow } from '../catalog/normalizeRow.js';
import { readCatalogSheet } from '../catalog/readCatalogSheet.js';
import type { CatalogItem } from '../catalog/types.js';
import { createBookRepository } from '../repositories/bookRepository.js';

const filePath = process.argv[2] ?? 'data/leescatalogus.xlsx';
const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) throw new Error('MONGO_URL is not set');

const rows = await readCatalogSheet(filePath);

const docsByKey = new Map<string, CatalogItem>();
const duplicates: string[] = [];
const warnings: string[] = [];

for (const { rowNumber, cells } of rows) {
    const result = normalizeRow(cells);
    if (!result) continue;
    for (const warning of result.warnings) {
        warnings.push(`row ${rowNumber} (${result.doc.title}): ${warning}`);
    }
    if (docsByKey.has(result.doc.key)) {
        duplicates.push(`row ${rowNumber} (${result.doc.title})`);
        continue;
    }
    docsByKey.set(result.doc.key, result.doc);
}

const client = new MongoClient(mongoUrl);
try {
    await client.connect();
    const bookRepository = createBookRepository(client.db(process.env.MONGO_DB));
    await bookRepository.ensureIndexes();
    const { inserted, updated } = await bookRepository.upsertMany([...docsByKey.values()]);

    console.log(`Read ${rows.length} rows from ${filePath}`);
    console.log(`Inserted ${inserted}, updated ${updated}`);
    if (duplicates.length) console.log(`Skipped ${duplicates.length} duplicate rows:`, duplicates);
    if (warnings.length) console.log(`${warnings.length} warnings:\n  ${warnings.join('\n  ')}`);
} finally {
    await client.close();
}
