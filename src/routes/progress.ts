import type { FastifyInstance } from 'fastify';
import { ok, problems, secured } from '../openapi/helpers.js';
import { createXpRepository } from '../repositories/xpRepository.js';
import { createProgressService } from '../services/progressService.js';

const schema = {
    tags: ['Progress'],
    summary: 'XP and badges of the logged in student',
    description:
        'Students earn XP for filling in the reading profile, adding titles to the reading list ' +
        '(more from the advice) and reading them. Every title counts once. Badges come at fixed ' +
        'amounts of XP.',
    security: secured,
    response: { 200: ok('Progress', 'XP, badges and the XP per action.'), ...problems(401, 403) },
};

export default async function progressRoutes(fastify: FastifyInstance): Promise<void> {
    const service = createProgressService({ xpRepository: createXpRepository(fastify.db) });

    fastify.get(
        '/progress/me',
        { preHandler: fastify.authorize('student'), schema },
        async (request) => service.getProgress(request.user.sub),
    );
}
