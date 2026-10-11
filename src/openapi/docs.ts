import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { sharedSchemas } from './schemas.js';

export const API_PREFIX = '/api';
export const DOCS_PATH = '/api/docs';

export const TAGS = [
    { name: 'Auth', description: 'Registering, logging in and the current user.' },
    { name: 'Catalog', description: 'Browsing and searching the books (MongoDB).' },
    { name: 'Profile', description: 'The reading profile of a student.' },
    { name: 'Advice', description: 'Book recommendations based on the profile.' },
    { name: 'Reading list', description: 'The personal reading list of a student.' },
    { name: 'Teachers', description: 'A student chooses which teachers may follow them.' },
    { name: 'Students', description: 'What a teacher sees about linked students.' },
    { name: 'System', description: 'Health check.' },
];

// Registers the OpenAPI generator and the shared schemas. This has to run before the routes.
// The Swagger UI is optional: the exported openapi.json does not need it.
export async function registerDocs(app: FastifyInstance, options: { ui: boolean }): Promise<void> {
    await app.register(swagger, {
        openapi: {
            openapi: '3.0.3',
            info: {
                title: 'Smart Reading Coach API',
                description:
                    'REST API of Smart Reading Coach. Errors are application/problem+json (RFC 9457). ' +
                    'Send the language in the Accept-Language header (nl or en) to get translated error messages.',
                version: '0.1.0',
            },
            servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
            tags: TAGS,
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Token from POST /api/auth/login or /api/auth/register.',
                    },
                },
            },
        },
        refResolver: {
            // Use the $id of a shared schema as its name in components/schemas.
            buildLocalReference: (json, _baseUri, _fragment, i) =>
                typeof json.$id === 'string' ? json.$id : `def-${i}`,
        },
    });

    for (const schema of sharedSchemas) app.addSchema(schema);

    if (options.ui) {
        await app.register(swaggerUi, { routePrefix: DOCS_PATH });
    }
}
