import type { Db } from 'mongodb';
import type { TopicSynonym } from '../entities/topicSynonym.js';

// Related themes per topic, as the AI service stored them. Read only: the AI service owns the
// collection and replaces it after every training.
export type RelatedTopics = ReadonlyMap<string, readonly string[]>;

export function createSynonymRepository(db: Db) {
    const synonyms = db.collection<TopicSynonym>('topic_synonyms');

    return {
        // Empty when the AI service never trained on this database: then topics match exactly.
        async relatedTo(terms: string[]): Promise<RelatedTopics> {
            if (terms.length === 0) return new Map();
            const docs = await synonyms
                .find({ term: { $in: terms } }, { projection: { _id: 0, term: 1, related: 1 } })
                .toArray();
            return new Map(docs.map((doc) => [doc.term, doc.related.map((item) => item.term)]));
        },
    };
}

export type SynonymRepository = ReturnType<typeof createSynonymRepository>;
