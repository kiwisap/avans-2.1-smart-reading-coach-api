// How the reading lists of the students of a teacher came about, to see whether the advice helps.
export interface SourceCount {
    total: number; // titles on the reading lists
    read: number; // of which marked as read
    rated: number; // ratings given to titles from this source
    averageRating: number | null; // average stars, null without ratings
}

export interface AdviceSourceStats {
    shown: number; // titles Bo showed
    added: number; // of which added from the advice page
    read: number; // of which read
    rated: number;
    averageRating: number | null;
}

export interface AdviceStatsDto {
    students: number;
    shown: number; // different titles Bo showed, over all students
    added: {
        advice: SourceCount;
        catalog: SourceCount;
        teacher: SourceCount;
        unknown: SourceCount; // added before the source was tracked
    };
    catalogAlsoSuggested: number; // added from the catalog, while Bo had shown the title too
    bySource: { ai: AdviceSourceStats; rules: AdviceSourceStats };
}
