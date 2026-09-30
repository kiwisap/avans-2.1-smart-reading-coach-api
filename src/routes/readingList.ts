import type { FastifyInstance } from 'fastify';
import { createBookRepository } from '../repositories/bookRepository.js';
import { createReadingListRepository } from '../repositories/readingListRepository.js';
import { READING_STATUSES, type ReadingStatus } from '../readingList/statuses.js';
import { createReadingListService } from '../services/readingListService.js';

const idParams = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
};

const addSchema = {
    body: {
        type: 'object',
        required: ['bookId'],
        additionalProperties: false,
        properties: { bookId: { type: 'string', pattern: '^[a-f0-9]{24}$' } },
    },
};

const statusSchema = {
    params: idParams,
    body: {
        type: 'object',
        required: ['status'],
        additionalProperties: false,
        properties: { status: { type: 'string', enum: READING_STATUSES } },
    },
};

export default async function readingListRoutes(fastify: FastifyInstance): Promise<void> {
    const service = createReadingListService({
        readingListRepository: createReadingListRepository(fastify.db),
        bookRepository: createBookRepository(fastify.mongo.db),
    });

    // The reading list is personal, so it is always the list of the logged in student.
    const preHandler = fastify.authorize('student');

    fastify.get('/reading-list', { preHandler }, async (request) => ({
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
        { preHandler, schema: { params: idParams } },
        async (request, reply) => {
            await service.remove(request.user.sub, request.params.id);
            return reply.code(204).send();
        },
    );
}
