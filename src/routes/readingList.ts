import type { FastifyInstance } from 'fastify';
import { problems, secured, wrap } from '../openapi/helpers.js';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createReadingListRepository } from '../repositories/readingListRepository.js';
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
        properties: { bookId: { type: 'string', pattern: '^[a-f0-9]{24}$' } },
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
    });

    // The reading list is personal, so it is always the list of the logged in student.
    const preHandler = fastify.authorize('student');

    fastify.get('/reading-list', { preHandler, schema: listSchema }, async (request) => ({
        items: await service.list(request.user.sub),
    }));

    fastify.post<{ Body: { bookId: string } }>(
        '/reading-list',
        { preHandler, schema: addSchema },
        async (request, reply) => {
            const item = await service.add(request.user.sub, request.body.bookId);
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

    fastify.delete<{ Params: { id: string } }>(
        '/reading-list/:id',
        { preHandler, schema: deleteSchema },
        async (request, reply) => {
            await service.remove(request.user.sub, request.params.id);
            return reply.code(204).send();
        },
    );
}
