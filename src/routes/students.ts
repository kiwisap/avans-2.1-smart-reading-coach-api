import type { FastifyInstance } from 'fastify';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createProfileRepository } from '../repositories/profileRepository.js';
import { createReadingListRepository } from '../repositories/readingListRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createReadingListService } from '../services/readingListService.js';
import { createTeacherService } from '../services/teacherService.js';

const studentParams = {
    type: 'object',
    required: ['studentId'],
    properties: { studentId: { type: 'string', format: 'uuid' } },
};

const addTitleSchema = {
    params: studentParams,
    body: {
        type: 'object',
        required: ['bookId'],
        additionalProperties: false,
        properties: { bookId: { type: 'string', pattern: '^[a-f0-9]{24}$' } },
    },
};

export default async function studentRoutes(fastify: FastifyInstance): Promise<void> {
    const readingListService = createReadingListService({
        readingListRepository: createReadingListRepository(fastify.db),
        bookRepository: createBookRepository(fastify.mongo.db),
    });
    const teacherService = createTeacherService({
        userRepository: createUserRepository(fastify.db),
        profileRepository: createProfileRepository(fastify.db),
        readingListService,
    });

    // Teachers only. Access to a specific student is checked again in the service.
    const preHandler = fastify.authorize('teacher');

    fastify.get('/students', { preHandler }, async (request) => ({
        students: await teacherService.listStudents(request.user.sub),
    }));

    fastify.get<{ Params: { studentId: string } }>(
        '/students/:studentId',
        { preHandler, schema: { params: studentParams } },
        async (request) =>
            teacherService.getStudentOverview(request.user.sub, request.params.studentId),
    );

    fastify.post<{ Params: { studentId: string }; Body: { bookId: string } }>(
        '/students/:studentId/reading-list',
        { preHandler, schema: addTitleSchema },
        async (request, reply) => {
            const item = await teacherService.addToStudentReadingList(
                request.user.sub,
                request.params.studentId,
                request.body.bookId,
            );
            return reply.code(201).send({ item });
        },
    );
}
