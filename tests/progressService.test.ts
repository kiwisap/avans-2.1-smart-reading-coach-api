import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BADGES, XP_REWARDS } from '../src/progress/xp.js';
import { toProgress } from '../src/services/progressService.js';

const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`);

describe('toProgress', () => {
    it('starts at zero with the first badge as the next goal', () => {
        const progress = toProgress([]);
        assert.equal(progress.xp, 0);
        assert.deepEqual(progress.nextBadge, BADGES[0]);
        assert.ok(progress.badges.every((badge) => badge.earnedAt === null));
        assert.deepEqual(progress.rewards, XP_REWARDS);
    });

    it('adds up XP and remembers when each badge was reached', () => {
        const progress = toProgress([
            { xp: 50, createdAt: at(1) },
            { xp: 40, createdAt: at(2) },
            { xp: 40, createdAt: at(3) },
            { xp: 40, createdAt: at(4) },
        ]);
        assert.equal(progress.xp, 170);
        assert.deepEqual(progress.badges[0]?.earnedAt, at(1)); // 50 XP
        assert.deepEqual(progress.badges[1]?.earnedAt, at(4)); // 150 XP
        assert.equal(progress.badges[2]?.earnedAt, null);
        assert.deepEqual(progress.nextBadge, { id: 'readingKnight', xp: 300 });
    });

    it('has no next badge when every badge is earned', () => {
        const progress = toProgress([{ xp: 5000, createdAt: at(1) }]);
        assert.equal(progress.nextBadge, null);
        assert.ok(progress.badges.every((badge) => badge.earnedAt !== null));
    });
});
