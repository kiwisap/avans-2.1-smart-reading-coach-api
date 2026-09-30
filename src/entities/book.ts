import type { LanguageLevel, MaterialType } from '../profile/profileOptions.js';

// One catalog item as it is stored in MongoDB (before Mongo adds _id).
export interface Book {
    key: string; // normalized title, author and type, used to avoid duplicates on import
    title: string;
    author: string | null;
    type: MaterialType;
    genre: string | null;
    format: string | null;
    description: string | null;
    themes: string[];
    levels: LanguageLevel[];
    levelLabel: string | null;
    url: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}
