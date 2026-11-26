import type { FastifyInstance } from 'fastify';
import { ok, problems, secured, wrap } from '../openapi/helpers.js';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createProfileRepository } from '../repositories/profileRepository.js';
import { createReadingListRepository } from '../repositories/readingListRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createAdviceStatsRepository } from '../repositories/adviceStatsRepository.js';
import { createSuggestionRepository } from '../repositories/suggestionRepository.js';
import { createXpRepository } from '../repositories/xpRepository.js';
import { createRatingRepository } from '../repositories/ratingRepository.js';
import { createAdviceStatsService } from '../services/adviceStatsService.js';
import { createProgressService } from '../services/progressService.js';
import { createAdviceService } from '../services/adviceService.js';
import { createReadingListService } from '../services/readingListService.js';
import {
    STUDENT_SEARCH_LIMIT,
    STUDENT_SEARCH_MIN_LENGTH,
    createTeacherLinkService,
} from '../services/teacherLinkService.js';
import { createTeacherService } from '../services/teacherService.js';

const studentParams = {
    type: 'object',
    required: ['studentId'],
    properties: { studentId: { type: 'string', format: 'uuid', description: 'Student id.' } },
};

const listSchema = {
    tags: ['Students'],
    summary: 'List the students this teacher follows',
    security: secured,
    response: {
        200: wrap('students', 'StudentSummary', 'Linked students.', true),
        ...problems(401, 403),
    },
};

const statsSchema = {
    tags: ['Students'],
    summary: 'Whether the advice of Bo helps, over the students this teacher follows',
    description:
        'How many titles Bo showed, how many ended up on reading lists (from the advice, the ' +
        'catalog or a teacher) and how many were read, split by AI model and rules.',
    security: secured,
    response: {
        200: ok('AdviceStats', 'Numbers about the advice.'),
        ...problems(401, 403),
    },
};

const searchSchema = {
    tags: ['Students'],
    summary: 'Search students to link to the logged in teacher',
    description: `Searches name and email address. At most ${STUDENT_SEARCH_LIMIT} results.`,
    security: secured,
    querystring: {
        type: 'object',
        required: ['search'],
        properties: {
            search: {
                type: 'string',
                minLength: STUDENT_SEARCH_MIN_LENGTH,
                maxLength: 100,
                description: 'Part of the name or email address.',
            },
        },
    },
    response: {
        200: wrap('students', 'StudentLink', 'Matching students.', true),
        ...problems(400, 401, 403),
    },
};

const linkSchema = {
    tags: ['Students'],
    summary: 'Follow a student as the logged in teacher',
    security: secured,
    params: studentParams,
    response: { 200: wrap('student', 'StudentLink', 'Linked.'), ...problems(400, 401, 403, 404) },
};

const unlinkSchema = {
    tags: ['Students'],
    summary: 'Stop following a student',
    security: secured,
    params: studentParams,
    response: { 200: wrap('student', 'StudentLink', 'Unlinked.'), ...problems(400, 401, 403, 404) },
};

const overviewSchema = {
    tags: ['Students'],
    summary: 'See the profile and reading list of one student',
    description: 'Only for students this teacher follows.',
    security: secured,
    params: studentParams,
    response: {
        200: { description: 'Student, profile and reading list.', $ref: 'StudentOverview#' },
        ...problems(400, 401, 403, 404),
    },
};

const adviceSchema = {
    tags: ['Students'],
    summary: 'See the reading advice of one student',
    description:
        'The same advice the student sees on the advice page. Only for students this teacher follows.',
    security: secured,
    params: studentParams,
    response: {
        200: ok('Advice', 'Recommended books for the student and where the advice comes from.'),
        ...problems(400, 401, 403, 404, 409),
    },
};

const addTitleSchema = {
    tags: ['Students'],
    summary: 'Add a book to the reading list of a student',
    security: secured,
    response: {
        201: wrap('item', 'ReadingListItem', 'Added.'),
        ...problems(400, 401, 403, 404, 409),
    },
    params: studentParams,
    body: {
        type: 'object',
        required: ['bookId'],
        additionalProperties: false,
        properties: { bookId: { type: 'string', pattern: '^[a-f0-9]{24}$' } },
    },
};

export default async function studentRoutes(fastify: FastifyInstance): Promise<void> {
    const bookRepository = createBookRepository(fastify.mongo.db);
    const profileRepository = createProfileRepository(fastify.db);
    const readingListRepository = createReadingListRepository(fastify.db);
    const xpRepository = createXpRepository(fastify.db);
    const ratingRepository = createRatingRepository(fastify.db);
    const readingListService = createReadingListService({
        readingListRepository,
        bookRepository,
        xpRepository,
        ratingRepository,
    });
    const adviceService = createAdviceService({
        profileRepository,
        bookRepository,
        readingListRepository,
        suggestionRepository: createSuggestionRepository(fastify.db),
        ratingRepository,
        aiClient: fastify.ai,
    });
    const userRepository = createUserRepository(fastify.db);
    const linkService = createTeacherLinkService({ userRepository });
    const teacherService = createTeacherService({
        userRepository,
        profileRepository,
        readingListService,
        adviceService,
        progressService: createProgressService({ xpRepository }),
    });
    const statsService = createAdviceStatsService({
        adviceStatsRepository: createAdviceStatsRepository(fastify.db),
        userRepository,
    });

    // Teachers only. Access to a specific student is checked again in the service.
    const preHandler = fastify.authorize('teacher');

    fastify.get('/students', { preHandler, schema: listSchema }, async (request) => ({
        students: await teacherService.listStudents(request.user.sub),
    }));

    fastify.get('/students/advice-stats', { preHandler, schema: statsSchema }, async (request) =>
        statsService.getStats(request.user.sub),
    );

    // A teacher looks up a student and links themselves to them.
    fastify.get<{ Querystring: { search: string } }>(
        '/students/search',
        { preHandler, schema: searchSchema },
        async (request) => ({
            students: await linkService.searchStudents(request.user.sub, request.query.search),
        }),
    );

    fastify.put<{ Params: { studentId: string } }>(
        '/students/:studentId/link',
        { preHandler, schema: linkSchema },
        async (request) => ({
            student: await linkService.link(request.user.sub, request.params.studentId),
        }),
    );

    fastify.delete<{ Params: { studentId: string } }>(
        '/students/:studentId/link',
        { preHandler, schema: unlinkSchema },
        async (request) => ({
            student: await linkService.unlink(request.user.sub, request.params.studentId),
        }),
    );

    fastify.get<{ Params: { studentId: string } }>(
        '/students/:studentId',
        { preHandler, schema: overviewSchema },
        async (request) =>
            teacherService.getStudentOverview(request.user.sub, request.params.studentId),
    );

    fastify.get<{ Params: { studentId: string } }>(
        '/students/:studentId/advice',
        { preHandler, schema: adviceSchema },
        async (request) =>
            teacherService.getStudentAdvice(
                request.user.sub,
                request.params.studentId,
                request.locale,
            ),
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
