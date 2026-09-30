import type { FastifyInstance } from 'fastify';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createProfileRepository } from '../repositories/profileRepository.js';
import { createAdviceService } from '../services/adviceService.js';

export default async function adviceRoutes(fastify: FastifyInstance): Promise<void> {
    const adviceService = createAdviceService({
        profileRepository: createProfileRepository(fastify.db),
        bookRepository: createBookRepository(fastify.mongo.db),
    });

    // Advice is based on the saved reading profile of the logged in student.
    fastify.get('/advice', { preHandler: fastify.authorize('student') }, async (request) => ({
        suggestions: await adviceService.getAdvice(request.user.sub),
    }));
}
