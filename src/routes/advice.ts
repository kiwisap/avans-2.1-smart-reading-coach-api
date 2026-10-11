import type { FastifyInstance } from 'fastify';
import { problems, secured, wrap } from '../openapi/helpers.js';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createProfileRepository } from '../repositories/profileRepository.js';
import { createAdviceService } from '../services/adviceService.js';

export default async function adviceRoutes(fastify: FastifyInstance): Promise<void> {
    const adviceService = createAdviceService({
        profileRepository: createProfileRepository(fastify.db),
        bookRepository: createBookRepository(fastify.mongo.db),
    });

    const schema = {
        tags: ['Advice'],
        summary: 'Get book recommendations for the logged in student',
        description:
            'Based on the saved reading profile. Each suggestion explains why it was recommended.',
        security: secured,
        response: {
            200: wrap('suggestions', 'Suggestion', 'Recommended books, best match first.', true),
            ...problems(401, 403, 409),
        },
    };

    // Advice is based on the saved reading profile of the logged in student.
    fastify.get(
        '/advice',
        { preHandler: fastify.authorize('student'), schema },
        async (request) => ({
            suggestions: await adviceService.getAdvice(request.user.sub, request.locale),
        }),
    );
}
