import { eq } from 'drizzle-orm';
import { readingProfiles, type ReadingProfileRow } from '../db/schema.js';
import type { Database } from '../db/types.js';
import type { ProfileData } from '../profile/profileOptions.js';

export function createProfileRepository(db: Database) {
    return {
        async findByUserId(userId: string): Promise<ReadingProfileRow | null> {
            const [profile] = await db
                .select()
                .from(readingProfiles)
                .where(eq(readingProfiles.userId, userId))
                .limit(1);
            return profile ?? null;
        },

        // Insert on first save, update afterwards.
        async upsert(userId: string, data: ProfileData): Promise<ReadingProfileRow> {
            const [profile] = await db
                .insert(readingProfiles)
                .values({ userId, ...data })
                .onConflictDoUpdate({
                    target: readingProfiles.userId,
                    set: { ...data, updatedAt: new Date() },
                })
                .returning();
            if (!profile) throw new Error('Could not save profile');
            return profile;
        },
    };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
