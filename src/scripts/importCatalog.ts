import { MongoClient } from 'mongodb';
import { createAiClient } from '../advice/aiClient.js';
import { buildCatalog } from '../catalog/buildCatalog.js';
import { readCatalogSheet } from '../catalog/readCatalogSheet.js';
import { createBookRepository } from '../repositories/bookRepository.js';

const filePath = process.argv[2] ?? 'data/leescatalogus.xlsx';
const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) throw new Error('MONGO_URL is not set');

const rows = await readCatalogSheet(filePath);
const { books, duplicates, warnings } = buildCatalog(rows);

const client = new MongoClient(mongoUrl);
try {
    await client.connect();
    const bookRepository = createBookRepository(client.db(process.env.MONGO_DB));
    await bookRepository.ensureIndexes();
    const { inserted, updated } = await bookRepository.upsertMany(books);

    console.log(`Read ${rows.length} rows from ${filePath}`);
    console.log(`Inserted ${inserted}, updated ${updated}`);
    if (duplicates.length) {
        console.log(`${duplicates.length} rows repeat a title, kept as extra source:`, duplicates);
    }
    if (warnings.length) console.log(`${warnings.length} warnings:\n  ${warnings.join('\n  ')}`);
} finally {
    await client.close();
}

// The AI model learns the catalog from MongoDB, so a new import is a reason to train again.
const aiUrl = process.env.AI_SERVICE_URL;
if (aiUrl) {
    const ai = createAiClient({ baseUrl: aiUrl, apiKey: process.env.AI_API_KEY, timeoutMs: 15000 });
    const started = await ai.retrain();
    console.log(
        started
            ? 'The AI service is training a new model on this catalog'
            : 'The AI service could not be asked to train, it keeps its current model',
    );
} else {
    console.log('AI_SERVICE_URL is not set, the AI model is not retrained');
}
