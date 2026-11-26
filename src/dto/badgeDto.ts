import type { BadgeId } from '../progress/xp.js';

export interface BadgeDto {
    id: BadgeId;
    xp: number; // XP needed for this badge
    earnedAt: Date | null; // null while the badge is not earned yet
}
