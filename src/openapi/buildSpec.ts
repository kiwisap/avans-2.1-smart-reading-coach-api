import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import auth from '../plugins/auth.js';
import errorHandler from '../plugins/errorHandler.js';
import locale from '../plugins/locale.js';
import { registerRoutes } from '../routes/index.js';
import { registerDocs } from './docs.js';

// An object that accepts any property access and any call and returns itself.
// It stands in for the database connections, so the routes can be registered (and described)
// without PostgreSQL or MongoDB. No request that reaches a database is ever sent to it.
function inert(): unknown {
    const proxy: unknown = new Proxy(function () {}, {
        get: (_target, property) => (property === 'then' ? undefined : proxy),
        apply: () => proxy,
    });
    return proxy;
}

const withoutDatabases = fp(async (fastify) => {
    fastify.decorate('pg', inert() as never);
    fastify.decorate('db', inert() as never);
    fastify.decorate('mongo', inert() as never);
});

// A Fastify app with all routes and plugins, but without database connections.
export async function buildSpecApp(
    configure?: (app: FastifyInstance) => void,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    configure?.(app); // for tests: lets them add hooks before the routes are registered
    await app.register(locale);
    await app.register(errorHandler);
    await app.register(withoutDatabases);
    await app.register(auth, { secret: 'openapi-export-only', expiresIn: '1h' });
    await registerDocs(app, { ui: false });
    await registerRoutes(app);
    await app.ready();
    return app;
}

// The OpenAPI document of the API, as plain JSON.
export async function buildOpenApiDocument(): Promise<Record<string, unknown>> {
    const app = await buildSpecApp();
    try {
        return JSON.parse(JSON.stringify(app.swagger())) as Record<string, unknown>;
    } finally {
        await app.close();
    }
}
