import type { FastifyInstance } from 'fastify';
import { nullableRef, ok, problems, secured, wrap } from '../openapi/helpers.js';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createProfileRepository } from '../repositories/profileRepository.js';
import { createProfileService } from '../services/profileService.js';
import type { ProfileData } from '../profile/profileOptions.js';

const optionsSchema = {
    tags: ['Profile'],
    summary: 'Get the possible answers for the profile form',
    security: secured,
    response: {
        200: ok('ProfileOptions', 'Levels, types, lengths, goals and topics.'),
        ...problems(401, 403),
    },
};

const getProfileSchema = {
    tags: ['Profile'],
    summary: 'Get the reading profile of the logged in student',
    description: 'The profile is null as long as the student has not saved one.',
    security: secured,
    response: {
        200: {
            description: 'The profile, or null.',
            type: 'object',
            required: ['profile'],
            properties: {
                profile: nullableRef('ReadingProfile'),
            },
        },
        ...problems(401, 403),
    },
};

const saveProfileSchema = {
    tags: ['Profile'],
    summary: 'Create or replace the reading profile',
    security: secured,
    body: { $ref: 'ProfileInput#' },
    response: {
        200: wrap('profile', 'ReadingProfile', 'The saved profile.'),
        ...problems(400, 401, 403),
    },
};

export default async function profileRoutes(fastify: FastifyInstance): Promise<void> {
    const profileService = createProfileService({
        profileRepository: createProfileRepository(fastify.db),
        bookRepository: createBookRepository(fastify.mongo.db),
    });

    // Reading profiles belong to students.
    const preHandler = fastify.authorize('student');

    fastify.get('/profile/options', { preHandler, schema: optionsSchema }, async () =>
        profileService.getOptions(),
    );

    fastify.get('/profile/me', { preHandler, schema: getProfileSchema }, async (request) => ({
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
