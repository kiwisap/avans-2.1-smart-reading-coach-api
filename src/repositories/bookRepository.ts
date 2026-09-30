import { ObjectId, type Db, type Filter, type WithId } from 'mongodb';
import type { Book, CatalogItem } from '../catalog/types.js';
import type { LanguageLevel } from '../profile/profileOptions.js';

const COLLATION = { locale: 'nl', strength: 2 }; // case and accent insensitive Dutch ordering

// What is really stored in MongoDB: the catalog item plus timestamps.
interface StoredBook extends CatalogItem {
    createdAt?: Date;
    updatedAt?: Date;
}

export interface BookSearch {
    search?: string;
    type?: string;
    level?: string;
    theme?: string;
    page: number;
    limit: number;
}

export interface CandidateQuery {
    allowedLevels: LanguageLevel[];
    topics?: string[];
    materialTypes?: string[];
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toDto(doc: WithId<StoredBook>): Book {
    const { _id, key: _key, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = doc;
    return { id: _id.toString(), ...rest };
}

const usable = (values: unknown[]): string[] =>
    values.filter((value): value is string => typeof value === 'string' && value.trim() !== '');

export function createBookRepository(db: Db) {
    const books = db.collection<StoredBook>('books');

    return {
        async ensureIndexes(): Promise<void> {
            await books.createIndexes([
                { key: { key: 1 }, name: 'key_unique', unique: true },
                { key: { type: 1 }, name: 'type' },
                { key: { levels: 1 }, name: 'levels' },
                { key: { themes: 1 }, name: 'themes' },
                { key: { title: 1 }, name: 'title_nl', collation: COLLATION },
            ]);
        },

        // Idempotent: running the import twice updates existing items instead of duplicating them.
        async upsertMany(docs: CatalogItem[]): Promise<{ inserted: number; updated: number }> {
            const now = new Date();
            const operations = docs.map((doc) => ({
                updateOne: {
                    filter: { key: doc.key },
                    update: { $set: { ...doc, updatedAt: now }, $setOnInsert: { createdAt: now } },
                    upsert: true,
                },
            }));
            const result = await books.bulkWrite(operations, { ordered: false });
            return { inserted: result.upsertedCount, updated: result.matchedCount };
        },

        async search({ search, type, level, theme, page, limit }: BookSearch) {
            const filter: Record<string, unknown> = {};
            if (type) filter.type = type;
            if (level) filter.levels = level;
            if (theme) filter.themes = theme;
            if (search) {
                const pattern = new RegExp(escapeRegex(search), 'i');
                filter.$or = [
                    { title: pattern },
                    { author: pattern },
                    { description: pattern },
                    { themes: pattern },
                ];
            }
            const query = filter as Filter<StoredBook>;

            const [total, docs] = await Promise.all([
                books.countDocuments(query),
                books
                    .find(query)
                    .collation(COLLATION)
                    .sort({ title: 1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .toArray(),
            ]);
            return { items: docs.map(toDto), total };
        },

        // Narrow query for the advice: only books at an allowed level, optionally limited to matching topics or types.
        async findCandidates({
            allowedLevels,
            topics,
            materialTypes,
        }: CandidateQuery): Promise<Book[]> {
            const conditions: Record<string, unknown>[] = [
                { $or: [{ levels: { $in: allowedLevels } }, { levels: { $size: 0 } }] },
            ];
            if (topics || materialTypes) {
                conditions.push({
                    $or: [
                        { themes: { $in: topics ?? [] } },
                        { type: { $in: materialTypes ?? [] } },
                    ],
                });
            }
            const docs = await books.find({ $and: conditions } as Filter<StoredBook>).toArray();
            return docs.map(toDto);
        },

        async findByIds(ids: string[]): Promise<Book[]> {
            const objectIds = ids
                .filter((id) => ObjectId.isValid(id))
                .map((id) => new ObjectId(id));
            if (objectIds.length === 0) return [];
            const docs = await books.find({ _id: { $in: objectIds } }).toArray();
            return docs.map(toDto);
        },

        async findById(id: string): Promise<Book | null> {
            if (!ObjectId.isValid(id)) return null;
            const doc = await books.findOne({ _id: new ObjectId(id) });
            return doc ? toDto(doc) : null;
        },

        // Values for the filter dropdowns.
        async facets(): Promise<{ types: string[]; levels: string[]; themes: string[] }> {
            const [types, levels, themes] = await Promise.all([
                books.distinct('type'),
                books.distinct('levels'),
                books.distinct('themes'),
            ]);
            return {
                types: usable(types).sort(),
                levels: usable(levels).sort(),
                themes: usable(themes).sort((a, b) => a.localeCompare(b, 'nl')),
            };
        },
    };
}

export type BookRepository = ReturnType<typeof createBookRepository>;
