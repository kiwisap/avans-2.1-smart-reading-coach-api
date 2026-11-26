import type { FastifyInstance } from 'fastify';
import { ok, problems, secured } from '../openapi/helpers.js';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createProfileRepository } from '../repositories/profileRepository.js';
import { createReadingListRepository } from '../repositories/readingListRepository.js';
import { createRatingRepository } from '../repositories/ratingRepository.js';
import { createSuggestionRepository } from '../repositories/suggestionRepository.js';
import { createAdviceService } from '../services/adviceService.js';
import { createSynonymRepository } from '../repositories/synonymRepository.js';

export default async function adviceRoutes(fastify: FastifyInstance): Promise<void> {
    const adviceService = createAdviceService({
        profileRepository: createProfileRepository(fastify.db),
        bookRepository: createBookRepository(fastify.mongo.db),
        readingListRepository: createReadingListRepository(fastify.db),
        suggestionRepository: createSuggestionRepository(fastify.db),
        ratingRepository: createRatingRepository(fastify.db),
        synonymRepository: createSynonymRepository(fastify.mongo.db),
        aiClient: fastify.ai,
    });

    const schema = {
        tags: ['Advice'],
        summary: 'Get book recommendations for the logged in student',
        description:
            'Based on the saved reading profile and the reading list. The AI model gives the advice ' +
            'when the AI service is available, otherwise the rule based scoring does. Each suggestion ' +
            'explains why it was recommended. Titles on the reading list are never suggested, so the ' +
            'advice changes when the student adds or reads titles.',
        security: secured,
        response: {
            200: ok(
                'Advice',
                'Recommended books, best match first, and where the advice comes from.',
            ),
            ...problems(401, 403, 409),
        },
    };

    // Advice is based on the saved reading profile of the logged in student.
    fastify.get('/advice', { preHandler: fastify.authorize('student'), schema }, async (request) =>
        adviceService.getAdvice(request.user.sub, request.locale),
    );
}
