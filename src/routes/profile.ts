import type { FastifyInstance } from 'fastify';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createProfileRepository } from '../repositories/profileRepository.js';
import { createProfileService } from '../services/profileService.js';
import {
    DESIRED_LENGTHS,
    LANGUAGE_LEVELS,
    MATERIAL_TYPES,
    MAX_TOPICS,
    READING_GOALS,
    type ProfileData,
} from '../profile/profileOptions.js';

const saveProfileSchema = {
    body: {
        type: 'object',
        required: ['languageLevel', 'materialTypes', 'topics', 'desiredLength', 'readingGoal'],
        additionalProperties: false,
        properties: {
            languageLevel: { type: 'string', enum: LANGUAGE_LEVELS },
            materialTypes: {
                type: 'array',
                minItems: 1,
                maxItems: MATERIAL_TYPES.length,
                items: { type: 'string', enum: MATERIAL_TYPES },
            },
            topics: {
                type: 'array',
                minItems: 1,
                maxItems: MAX_TOPICS,
                items: { type: 'string', maxLength: 60 },
            },
            desiredLength: { type: 'string', enum: DESIRED_LENGTHS },
            readingGoal: { type: 'string', enum: READING_GOALS },
        },
    },
};

export default async function profileRoutes(fastify: FastifyInstance): Promise<void> {
    const profileService = createProfileService({
        profileRepository: createProfileRepository(fastify.db),
        bookRepository: createBookRepository(fastify.mongo.db),
    });

    // Reading profiles belong to students.
    const preHandler = fastify.authorize('student');

    fastify.get('/profile/options', { preHandler }, async () => profileService.getOptions());

    fastify.get('/profile/me', { preHandler }, async (request) => ({
        profile: await profileService.getProfile(request.user.sub),
    }));

    fastify.put<{ Body: ProfileData }>(
        '/profile/me',
        { preHandler, schema: saveProfileSchema },
        async (request) => ({
            profile: await profileService.saveProfile(request.user.sub, request.body),
        }),
    );
}
