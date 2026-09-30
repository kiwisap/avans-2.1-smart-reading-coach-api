import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import postgres from './plugins/postgres.js';
import mongo from './plugins/mongo.js';
import auth from './plugins/auth.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/students.js';
import bookRoutes from './routes/books.js';
import profileRoutes from './routes/profile.js';
import adviceRoutes from './routes/advice.js';
import readingListRoutes from './routes/readingList.js';
import teacherRoutes from './routes/teachers.js';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: true });

    await app.register(cors, {
        origin: config.corsOrigin,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    await app.register(postgres, { connectionString: config.postgresUrl });
    await app.register(mongo, { url: config.mongoUrl, dbName: config.mongoDb });
    await app.register(auth, { secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });

    await app.register(healthRoutes, { prefix: '/api' });
    await app.register(authRoutes, { prefix: '/api' });
    await app.register(studentRoutes, { prefix: '/api' });
    await app.register(bookRoutes, { prefix: '/api' });
    await app.register(profileRoutes, { prefix: '/api' });
    await app.register(adviceRoutes, { prefix: '/api' });
    await app.register(readingListRoutes, { prefix: '/api' });
    await app.register(teacherRoutes, { prefix: '/api' });

    return app;
}
