// Body of PUT /reading-list/:id/rating.
export interface RateBookDto {
    rating: number; // 1 to 5 stars
    comment?: string | null;
}
