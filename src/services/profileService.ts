import { HttpError } from '../errors.js';
import type { ProfileDto } from '../dto/profileDto.js';
import {
    DESIRED_LENGTHS,
    LANGUAGE_LEVELS,
    MATERIAL_TYPES,
    MAX_TOPICS,
    READING_GOALS,
    type ProfileData,
} from '../profile/profileOptions.js';
import type { BookRepository } from '../repositories/bookRepository.js';
import type { ProfileRepository } from '../repositories/profileRepository.js';
import { toProfileDto } from './mappingService.js';

interface Deps {
    profileRepository: Pick<ProfileRepository, 'findByUserId' | 'upsert'>;
    bookRepository: Pick<BookRepository, 'facets'>;
}

export function createProfileService({ profileRepository, bookRepository }: Deps) {
    return {
        async getProfile(userId: string): Promise<ProfileDto | null> {
            return toProfileDto(await profileRepository.findByUserId(userId));
        },

        async saveProfile(userId: string, input: ProfileData): Promise<ProfileDto | null> {
            const topics = [...new Set(input.topics)];
            const materialTypes = [...new Set(input.materialTypes)];

            if (topics.length > MAX_TOPICS) {
                throw new HttpError(400, `Kies maximaal ${MAX_TOPICS} onderwerpen`);
            }

            // Topics must exist in the catalog, otherwise advice could never match them.
            const { themes } = await bookRepository.facets();
            const unknown = topics.filter((topic) => !themes.includes(topic));
            if (unknown.length > 0) {
                throw new HttpError(400, `Onbekende onderwerpen: ${unknown.join(', ')}`);
            }

            const saved = await profileRepository.upsert(userId, {
                languageLevel: input.languageLevel,
                materialTypes,
                topics,
                desiredLength: input.desiredLength,
                readingGoal: input.readingGoal,
            });
            return toProfileDto(saved);
        },

        async getOptions() {
            const { themes } = await bookRepository.facets();
            return {
                languageLevels: LANGUAGE_LEVELS,
                materialTypes: MATERIAL_TYPES,
                desiredLengths: DESIRED_LENGTHS,
                readingGoals: READING_GOALS,
                maxTopics: MAX_TOPICS,
                topics: themes,
            };
        },
    };
}
