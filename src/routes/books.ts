import type { FastifyInstance } from 'fastify';
import { HttpError } from '../errors.js';
import { ok, problems, secured } from '../openapi/helpers.js';
import { createBookRepository, type BookSearch } from '../repositories/bookRepository.js';

const listSchema = {
    tags: ['Catalog'],
    summary: 'Search and filter the catalog',
    description: 'A book matches when it fits one of the values of every filter that is given.',
    security: secured,
    response: { 200: ok('BookPage', 'One page of books.'), ...problems(400, 401) },
    querystring: {
        type: 'object',
        properties: {
            search: {
                type: 'string',
                maxLength: 100,
                description: 'Words in the title or author.',
            },
            // type, level and theme are repeatable (?theme=a&theme=b): a book matches when it
            // fits at least one value per filter, and all filters have to match.
            type: { type: 'array', items: { type: 'string', maxLength: 30 }, maxItems: 10 },
            level: {
                type: 'array',
                items: { type: 'string', enum: ['2F', '3F', '3F+'] },
                maxItems: 3,
            },
            theme: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 10 },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
        },
    },
};

const filtersSchema = {
    tags: ['Catalog'],
    summary: 'List the values to filter on',
    security: secured,
    response: {
        200: ok('BookFacets', 'Types, levels and themes in the catalog.'),
        ...problems(401),
    },
};

const idSchema = {
    tags: ['Catalog'],
    summary: 'Get one book',
    security: secured,
    response: { 200: ok('Book', 'The book.'), ...problems(400, 401, 404) },
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

    fastify.get('/books/filters', { preHandler, schema: filtersSchema }, async () =>
        bookRepository.facets(),
    );

    fastify.get<{ Params: { id: string } }>(
        '/books/:id',
        { schema: idSchema, preHandler },
        async (request) => {
            const book = await bookRepository.findById(request.params.id);
            if (!book) throw new HttpError(404, 'books.notFound');
            return book;
        },
    );
}
