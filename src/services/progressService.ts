import type { ProgressDto } from '../dto/progressDto.js';
import type { XpEvent } from '../entities/xpEvent.js';
import { BADGES, XP_REWARDS } from '../progress/xp.js';
import type { XpRepository } from '../repositories/xpRepository.js';

// Total XP, the badges with the moment each was earned, and the next badge to aim for.
export function toProgress(events: Pick<XpEvent, 'xp' | 'createdAt'>[]): ProgressDto {
    const earnedAt = new Map<string, Date>();
    let xp = 0;
    for (const event of events) {
        xp += event.xp;
        for (const badge of BADGES) {
            if (xp >= badge.xp && !earnedAt.has(badge.id)) earnedAt.set(badge.id, event.createdAt);
        }
    }
    const next = BADGES.find((badge) => xp < badge.xp);
    return {
        xp,
        badges: BADGES.map((badge) => ({
            id: badge.id,
            xp: badge.xp,
            earnedAt: earnedAt.get(badge.id) ?? null,
        })),
        nextBadge: next ? { id: next.id, xp: next.xp } : null,
        rewards: { ...XP_REWARDS },
    };
}

interface Deps {
    xpRepository: Pick<XpRepository, 'listByUser'>;
}

export function createProgressService({ xpRepository }: Deps) {
    return {
        async getProgress(userId: string): Promise<ProgressDto> {
            return toProgress(await xpRepository.listByUser(userId));
        },
    };
}

export type ProgressService = ReturnType<typeof createProgressService>;
