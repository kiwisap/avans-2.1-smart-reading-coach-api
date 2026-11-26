// The game around reading: students earn XP for what they do and get badges at fixed amounts.
// XP is stored as events (table xp_events). Every reason counts once per title, so adding,
// removing and adding a title again, or marking it read twice, gives no extra XP.

export const XP_REASONS = ['profile', 'added', 'read', 'rated'] as const;
export type XpReason = (typeof XP_REASONS)[number];

export const XP_REWARDS = {
    profile: 50, // filling in the reading profile
    added: 10, // a title on the reading list from the catalog
    addedFromAdvice: 15, // a title on the reading list from the advice of Bo
    read: 40, // a title marked as read
    rated: 10, // telling Bo what you thought of a title
} as const;

// Ordered from low to high. The frontend has the names and icons per id.
export const BADGES = [
    { id: 'firstPage', xp: 50 },
    { id: 'bookworm', xp: 150 },
    { id: 'readingKnight', xp: 300 },
    { id: 'storyHunter', xp: 500 },
    { id: 'pageBoss', xp: 800 },
    { id: 'legend', xp: 1200 },
] as const;

export type BadgeId = (typeof BADGES)[number]['id'];
export const BADGE_IDS = BADGES.map((badge) => badge.id);
