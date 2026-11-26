// Themes that mean the same as a term, or something narrower. The AI service learns them from
// the Open Multilingual Wordnet when it trains and stores them in MongoDB (topic_synonyms).
export interface TopicSynonym {
    term: string;
    related: { term: string; relation: 'synonym' | 'narrower' }[];
    source: string;
    modelVersion: string;
    updatedAt: Date;
}
