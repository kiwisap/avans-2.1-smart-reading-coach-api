import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProfileData } from '../src/profile/profileOptions.js';
import { createProfileService } from '../src/services/profileService.js';

interface SavedCall {
    userId: string;
    data: ProfileData;
}

function setup(themes: string[] = ['liefde', 'oorlog', 'humor']) {
    const calls: SavedCall[] = [];
    const profileRepository = {
        findByUserId: async () => null,
        upsert: async (userId: string, data: ProfileData) => {
            calls.push({ userId, data });
            return {
                userId,
                ...data,
                createdAt: new Date('2026-01-01'),
                updatedAt: new Date('2026-01-01'),
            };
        },
    };
    const bookRepository = { facets: async () => ({ types: [], levels: [], themes }) };
    return { service: createProfileService({ profileRepository, bookRepository }), calls };
}

const valid: ProfileData = {
    languageLevel: '2F',
    materialTypes: ['boek'],
    topics: ['liefde'],
    desiredLength: 'short',
    readingGoal: 'enjoyment',
};

const statusOf = (err: unknown) => (err as { statusCode?: number }).statusCode;

describe('profileService', () => {
    it('returns null when the student has no profile yet', async () => {
        const { service } = setup();
        assert.equal(await service.getProfile('u1'), null);
    });

    it('saves a valid profile for the given user', async () => {
        const { service, calls } = setup();
        const profile = await service.saveProfile('u1', valid);
        assert.equal(calls[0]?.userId, 'u1');
        assert.equal(profile?.languageLevel, '2F');
    });

    it('removes duplicate topics and material types', async () => {
        const { service, calls } = setup();
        await service.saveProfile('u1', {
            ...valid,
            topics: ['liefde', 'liefde'],
            materialTypes: ['boek', 'boek'],
        });
        assert.deepEqual(calls[0]?.data.topics, ['liefde']);
        assert.deepEqual(calls[0]?.data.materialTypes, ['boek']);
    });

    it('rejects topics that are not in the catalog', async () => {
        const { service, calls } = setup();
        await assert.rejects(
            service.saveProfile('u1', { ...valid, topics: ['bestaat niet'] }),
            (err: unknown) =>
                statusOf(err) === 400 && (err as Error).message.includes('bestaat niet'),
        );
        assert.equal(calls.length, 0);
    });

    it('rejects more than five topics', async () => {
        const { service } = setup(['a', 'b', 'c', 'd', 'e', 'f']);
        await assert.rejects(
            service.saveProfile('u1', { ...valid, topics: ['a', 'b', 'c', 'd', 'e', 'f'] }),
            (err: unknown) => statusOf(err) === 400,
        );
    });
});
