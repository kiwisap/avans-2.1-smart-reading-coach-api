import type { LanguageLevel, MaterialType } from '../profile/profileOptions.js';

// One spreadsheet row as it was imported: column header to cell text, empty cells left out.
// The AI service trains on these rows, so it sees exactly the same data as the spreadsheet.
export type CatalogSourceRow = Record<string, string>;

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
    sources?: CatalogSourceRow[]; // the imported rows, more than one when the sheet repeats a title
    createdAt?: Date;
    updatedAt?: Date;
}
