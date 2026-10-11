import type { FastifyInstance } from 'fastify';
import { API_PREFIX } from '../openapi/docs.js';
import adviceRoutes from './advice.js';
import authRoutes from './auth.js';
import bookRoutes from './books.js';
import healthRoutes from './health.js';
import profileRoutes from './profile.js';
import readingListRoutes from './readingList.js';
import studentRoutes from './students.js';
import teacherRoutes from './teachers.js';

// All routes of the API, under /api. Used by the real app and by the OpenAPI export.
export async function registerRoutes(app: FastifyInstance): Promise<void> {
    await app.register(healthRoutes, { prefix: API_PREFIX });
    await app.register(authRoutes, { prefix: API_PREFIX });
    await app.register(studentRoutes, { prefix: API_PREFIX });
    await app.register(bookRoutes, { prefix: API_PREFIX });
    await app.register(profileRoutes, { prefix: API_PREFIX });
    await app.register(adviceRoutes, { prefix: API_PREFIX });
    await app.register(readingListRoutes, { prefix: API_PREFIX });
    await app.register(teacherRoutes, { prefix: API_PREFIX });
}
