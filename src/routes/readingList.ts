import type { FastifyInstance } from 'fastify';
import { problems, secured, wrap } from '../openapi/helpers.js';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createReadingListRepository } from '../repositories/readingListRepository.js';
import { createRatingRepository } from '../repositories/ratingRepository.js';
import { createXpRepository } from '../repositories/xpRepository.js';
import type { RateBookDto } from '../dto/rateBookDto.js';
import { MAX_COMMENT_LENGTH, MAX_RATING, MIN_RATING } from '../readingList/ratings.js';
import { STUDENT_SOURCES, type StudentSource } from '../readingList/sources.js';
import type { ReadingStatus } from '../readingList/statuses.js';
import { createReadingListService } from '../services/readingListService.js';

const idParams = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid', description: 'Reading list entry id.' } },
};

const listSchema = {
    tags: ['Reading list'],
    summary: 'Get the reading list of the logged in student',
    security: secured,
    response: {
        200: wrap('items', 'ReadingListItem', 'Entries, newest first.', true),
        ...problems(401, 403),
    },
};

const addSchema = {
    tags: ['Reading list'],
    summary: 'Add a book to the reading list',
    security: secured,
    response: {
        201: wrap('item', 'ReadingListItem', 'Added.'),
        ...problems(400, 401, 403, 404, 409),
    },
    body: {
        type: 'object',
        required: ['bookId'],
        additionalProperties: false,
        properties: {
            bookId: { type: 'string', pattern: '^[a-f0-9]{24}$' },
            source: {
                type: 'string',
                enum: [...STUDENT_SOURCES],
                default: 'catalog',
                description: 'Where the student added the title: the advice page or the catalog.',
            },
        },
    },
};

const statusSchema = {
    tags: ['Reading list'],
    summary: 'Mark an entry as read or unread',
    security: secured,
    response: { 200: wrap('item', 'ReadingListItem', 'Updated.'), ...problems(400, 401, 403, 404) },
    params: idParams,
    body: {
        type: 'object',
        required: ['status'],
        additionalProperties: false,
        properties: { status: { $ref: 'ReadingStatus#' } },
    },
};

const rateSchema = {
    tags: ['Reading list'],
    summary: 'Say what you thought of a title you read',
    description:
        'One to five stars and an optional short comment. Can be changed later. The ratings of ' +
        'students with a similar profile help the advice for others.',
    security: secured,
    params: idParams,
    response: {
        200: wrap('item', 'ReadingListItem', 'Rated.'),
        ...problems(400, 401, 403, 404, 409),
    },
    body: {
        type: 'object',
        required: ['rating'],
        additionalProperties: false,
        properties: {
            rating: { type: 'integer', minimum: MIN_RATING, maximum: MAX_RATING },
            comment: { type: 'string', maxLength: MAX_COMMENT_LENGTH, nullable: true },
        },
    },
};

const deleteSchema = {
    tags: ['Reading list'],
    summary: 'Remove an entry from the reading list',
    security: secured,
    params: idParams,
    response: { 204: { description: 'Removed.', type: 'null' }, ...problems(400, 401, 403, 404) },
};

export default async function readingListRoutes(fastify: FastifyInstance): Promise<void> {
    const service = createReadingListService({
        readingListRepository: createReadingListRepository(fastify.db),
        bookRepository: createBookRepository(fastify.mongo.db),
        xpRepository: createXpRepository(fastify.db),
        ratingRepository: createRatingRepository(fastify.db),
    });

    // The reading list is personal, so it is always the list of the logged in student.
    const preHandler = fastify.authorize('student');

    fastify.get('/reading-list', { preHandler, schema: listSchema }, async (request) => ({
        items: await service.list(request.user.sub),
    }));

    fastify.post<{ Body: { bookId: string; source?: StudentSource } }>(
        '/reading-list',
        { preHandler, schema: addSchema },
        async (request, reply) => {
            const { bookId, source = 'catalog' } = request.body;
            const item = await service.add(request.user.sub, bookId, source);
            return reply.code(201).send({ item });
        },
    );

    fastify.patch<{ Params: { id: string }; Body: { status: ReadingStatus } }>(
        '/reading-list/:id',
        { preHandler, schema: statusSchema },
        async (request) => ({
            item: await service.setStatus(request.user.sub, request.params.id, request.body.status),
        }),
    );

    fastify.put<{ Params: { id: string }; Body: RateBookDto }>(
        '/reading-list/:id/rating',
        { preHandler, schema: rateSchema },
        async (request) => ({
            item: await service.rate(
                request.user.sub,
                request.params.id,
                request.body.rating,
                request.body.comment,
            ),
        }),
    );

    fastify.delete<{ Params: { id: string } }>(
        '/reading-list/:id',
        { preHandler, schema: deleteSchema },
        async (request, reply) => {
            await service.remove(request.user.sub, request.params.id);
            return reply.code(204).send();
        },
    );
}
