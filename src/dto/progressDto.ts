import type { BadgeId } from '../progress/xp.js';
import type { BadgeDto } from './badgeDto.js';

export interface ProgressDto {
    xp: number;
    badges: BadgeDto[];
    nextBadge: { id: BadgeId; xp: number } | null; // null when every badge is earned
    rewards: {
        profile: number;
        added: number;
        addedFromAdvice: number;
        read: number;
        rated: number;
    };
}
