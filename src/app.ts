import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import postgres from './plugins/postgres.js';
import mongo from './plugins/mongo.js';
import auth from './plugins/auth.js';
import errorHandler from './plugins/errorHandler.js';
import locale from './plugins/locale.js';
import { registerDocs } from './openapi/docs.js';
import { registerRoutes } from './routes/index.js';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: true });

    await app.register(cors, {
        origin: config.corsOrigin,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    await app.register(locale);
    await app.register(errorHandler);
    await app.register(postgres, { connectionString: config.postgresUrl });
    await app.register(mongo, { url: config.mongoUrl, dbName: config.mongoDb });
    await app.register(auth, { secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });

    // API documentation: Swagger UI on /api/docs, built from the same schemas the routes use.
    await registerDocs(app, { ui: true });
    await registerRoutes(app);

    return app;
}
