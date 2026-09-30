import type { FastifyInstance } from 'fastify';
import { HttpError } from '../errors.js';
import { createBookRepository, type BookSearch } from '../repositories/bookRepository.js';

const listSchema = {
    querystring: {
        type: 'object',
        properties: {
            search: { type: 'string', maxLength: 100 },
            type: { type: 'string', maxLength: 30 },
            level: { type: 'string', enum: ['2F', '3F', '3F+'] },
            theme: { type: 'string', maxLength: 60 },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
        },
    },
};

const idSchema = {
    params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: '^[a-f0-9]{24}$' } },
    },
};

export default async function bookRoutes(fastify: FastifyInstance): Promise<void> {
    const bookRepository = createBookRepository(fastify.mongo.db);
    await bookRepository.ensureIndexes();

    // Any logged in user (student or teacher) may browse the catalog.
    const preHandler = fastify.authenticate;

    fastify.get<{ Querystring: BookSearch }>(
        '/books',
        { schema: listSchema, preHandler },
        async (request) => {
            const { page, limit } = request.query;
            const { items, total } = await bookRepository.search(request.query);
            return { items, total, page, limit };
        },
    );

    fastify.get('/books/filters', { preHandler }, async () => bookRepository.facets());

    fastify.get<{ Params: { id: string } }>(
        '/books/:id',
        { schema: idSchema, preHandler },
        async (request) => {
            const book = await bookRepository.findById(request.params.id);
            if (!book) throw new HttpError(404, 'Titel niet gevonden');
            return book;
        },
    );
}
