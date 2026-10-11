import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { BookDto } from '../src/dto/bookDto.js';
import type { ReadingListItemDto } from '../src/dto/readingListItemDto.js';
import type { StudentOverviewDto } from '../src/dto/studentOverviewDto.js';
import type { SuggestionDto } from '../src/dto/suggestionDto.js';
import type { UserDto } from '../src/dto/userDto.js';
import Fastify from 'fastify';
import { buildOpenApiDocument, buildSpecApp } from '../src/openapi/buildSpec.js';
import { sharedSchemas } from '../src/openapi/schemas.js';

// ajv-formats is a CommonJS module: under NodeNext its types describe the module, not the function.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

interface Operation {
    summary?: string;
    tags?: string[];
    security?: unknown[];
    responses?: Record<string, unknown>;
}
type Document = { paths: Record<string, Record<string, Operation>> };

const PUBLIC = new Set(['GET /api/health', 'POST /api/auth/register', 'POST /api/auth/login']);
const document = (await buildOpenApiDocument()) as unknown as Document;
const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({
        key: `${method.toUpperCase()} ${path}`,
        operation,
    })),
);

function createValidator(): Ajv {
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    for (const schema of sharedSchemas) ajv.addSchema(schema);
    return ajv;
}

describe('OpenAPI document', () => {
    it('describes every route that the app registers', async () => {
        const registered = new Set<string>();
        const app = await buildSpecApp((instance) => {
            instance.addHook('onRoute', (route) => {
                for (const method of [route.method].flat()) {
                    if (method === 'HEAD' || method === 'OPTIONS') continue;
                    registered.add(`${method} ${route.url.replace(/:(\w+)/g, '{$1}')}`);
                }
            });
        });
        await app.close();

        const documented = new Set(operations.map((entry) => entry.key));
        const apiRoutes = [...registered].filter((key) => key.includes(' /api/'));
        assert.ok(apiRoutes.length >= 17, 'the app should register its routes');
        assert.deepEqual(
            apiRoutes.filter((key) => !documented.has(key)),
            [],
            'routes without documentation',
        );
        assert.deepEqual(
            [...documented].filter((key) => !registered.has(key)),
            [],
            'documentation for routes that do not exist',
        );
    });

    it('gives every operation a summary, a tag and a success response', () => {
        for (const { key, operation } of operations) {
            assert.ok(operation.summary, `${key} has no summary`);
            assert.ok(operation.tags?.length, `${key} has no tag`);
            const statuses = Object.keys(operation.responses ?? {});
            assert.ok(
                statuses.some((status) => status.startsWith('2')),
                `${key} has no 2xx response`,
            );
        }
    });

    it('requires a bearer token on every route except login, register and health', () => {
        for (const { key, operation } of operations) {
            const secured = (operation.security?.length ?? 0) > 0;
            assert.equal(secured, !PUBLIC.has(key), `${key} security does not match its role`);
            if (secured) assert.ok('401' in (operation.responses ?? {}), `${key} misses a 401`);
        }
    });

    it('is the same as the committed openapi.json (run npm run openapi after changing a route)', async () => {
        const committed = JSON.parse(
            await readFile(new URL('../openapi.json', import.meta.url), 'utf8'),
        ) as unknown;
        assert.deepEqual(committed, document);
    });
});

describe('DTOs follow the schemas', () => {
    const ajv = createValidator();

    function assertValid(schemaId: string, value: unknown): void {
        const validate = ajv.getSchema(schemaId);
        assert.ok(validate, `schema ${schemaId} exists`);
        // JSON round trip, like a real response (a Date becomes an ISO string).
        const valid = validate(JSON.parse(JSON.stringify(value)));
        assert.ok(valid, `${schemaId}: ${ajv.errorsText(validate.errors)}`);
    }

    const book: BookDto = {
        id: '65f1c2a4e4b0a1b2c3d4e5f6',
        title: 'De kleine prins',
        author: null,
        type: 'boek',
        genre: 'Roman',
        format: null,
        description: null,
        themes: ['vriendschap'],
        levels: ['2F', '3F'],
        levelLabel: '2F/3F',
        url: null,
    };
    const user: UserDto = {
        id: crypto.randomUUID(),
        email: 'a@b.nl',
        name: 'Sam',
        role: 'student',
    };

    it('accepts a book, a suggestion and a user', () => {
        assertValid('Book', book);
        const suggestion: SuggestionDto = { ...book, motivation: 'Past bij je niveau.' };
        assertValid('Suggestion', suggestion);
        assertValid('User', user);
        assertValid('AuthResponse', { token: 'x.y.z', user });
    });

    it('accepts a reading list item, also when the book is gone', () => {
        const item: ReadingListItemDto = {
            id: crypto.randomUUID(),
            bookId: book.id,
            status: 'unread',
            addedAt: new Date(),
            readAt: null,
            book,
        };
        assertValid('ReadingListItem', item);
        assertValid('ReadingListItem', { ...item, book: null, status: 'read', readAt: new Date() });
    });

    it('accepts the overview a teacher sees', () => {
        const overview: StudentOverviewDto = {
            student: { id: user.id, name: user.name, email: user.email },
            profile: null,
            readingList: [],
        };
        assertValid('StudentOverview', overview);
        assertValid('StudentOverview', {
            ...overview,
            profile: {
                languageLevel: '3F',
                materialTypes: ['boek'],
                topics: ['sport'],
                desiredLength: 'short',
                readingGoal: 'enjoyment',
                updatedAt: new Date(),
            },
        });
    });

    it('rejects data that does not match', () => {
        const validate = ajv.getSchema('User');
        assert.ok(validate);
        assert.equal(validate({ ...user, role: 'admin' }), false);
        assert.equal(validate({ id: user.id }), false);
    });
});

describe('error responses', () => {
    it('are problem details, as the document says', async () => {
        const app = await buildSpecApp();
        try {
            const ajv = createValidator();
            const validate = ajv.getSchema('ProblemDetails');
            assert.ok(validate);

            const missingToken = await app.inject({ method: 'GET', url: '/api/books' });
            const badBody = await app.inject({
                method: 'POST',
                url: '/api/auth/login',
                payload: { email: 'not-an-email' },
            });

            for (const [response, status] of [
                [missingToken, 401],
                [badBody, 400],
            ] as const) {
                assert.equal(response.statusCode, status);
                assert.match(
                    String(response.headers['content-type']),
                    /application\/problem\+json/,
                );
                assert.ok(validate(response.json()), ajv.errorsText(validate.errors));
            }
        } finally {
            await app.close();
        }
    });
});

describe('response serialization', () => {
    // Fastify serializes responses with the same schemas. A field that is missing in a schema
    // would silently disappear from the response, so this compares input and output.
    async function serialize(schemaId: string, value: unknown): Promise<unknown> {
        const app = Fastify();
        for (const schema of sharedSchemas) app.addSchema(schema);
        app.get('/x', { schema: { response: { 200: { $ref: `${schemaId}#` } } } }, () => value);
        try {
            return (await app.inject({ method: 'GET', url: '/x' })).json();
        } finally {
            await app.close();
        }
    }

    const book: BookDto = {
        id: '65f1c2a4e4b0a1b2c3d4e5f6',
        title: 'De kleine prins',
        author: 'Antoine',
        type: 'boek',
        genre: null,
        format: null,
        description: 'Een verhaal.',
        themes: ['vriendschap'],
        levels: ['3F'],
        levelLabel: '3F',
        url: 'https://example.org/boek',
    };
    const item: ReadingListItemDto = {
        id: '5f0a1d7e-7f0c-4a53-9d7a-6b0a2f3b1c11',
        bookId: book.id,
        status: 'read',
        addedAt: new Date('2026-09-01T10:00:00.000Z'),
        readAt: new Date('2026-09-02T10:00:00.000Z'),
        book,
    };

    it('keeps every field of a reading list item', async () => {
        assert.deepEqual(
            await serialize('ReadingListItem', item),
            JSON.parse(JSON.stringify(item)),
        );
    });

    it('keeps null for a book that left the catalog', async () => {
        const gone = { ...item, book: null };
        assert.deepEqual(
            await serialize('ReadingListItem', gone),
            JSON.parse(JSON.stringify(gone)),
        );
    });

    it('keeps a suggestion with its motivation', async () => {
        const suggestion: SuggestionDto = { ...book, motivation: 'Past bij je niveau.' };
        assert.deepEqual(await serialize('Suggestion', suggestion), suggestion);
    });

    it('keeps a student overview with and without a profile', async () => {
        const overview: StudentOverviewDto = {
            student: { id: item.id, name: 'Sam', email: 'sam@example.org' },
            profile: null,
            readingList: [item],
        };
        const expected = JSON.parse(JSON.stringify(overview));
        assert.deepEqual(await serialize('StudentOverview', overview), expected);

        const withProfile = {
            ...overview,
            profile: {
                languageLevel: '3F',
                materialTypes: ['boek'],
                topics: ['sport'],
                desiredLength: 'short',
                readingGoal: 'enjoyment',
                updatedAt: new Date('2026-09-03T10:00:00.000Z'),
            },
        };
        assert.deepEqual(
            await serialize('StudentOverview', withProfile),
            JSON.parse(JSON.stringify(withProfile)),
        );
    });
});
