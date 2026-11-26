import type { FastifyInstance } from 'fastify';
import { ok } from '../openapi/helpers.js';

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
    const schema = {
        tags: ['System'],
        summary: 'Check that the API, both databases and the AI service respond',
        response: { 200: ok('Health', 'The API runs.') },
    };

    fastify.get('/health', { schema }, async () => {
        const [pgResult, mongoResult, aiHealthy] = await Promise.all([
            fastify.pg.query('SELECT 1 AS ok'),
            fastify.mongo.db.command({ ping: 1 }),
            fastify.ai ? fastify.ai.isHealthy() : Promise.resolve(null),
        ]);
        return {
            status: 'ok',
            postgres: pgResult.rows[0].ok === 1,
            mongo: mongoResult.ok === 1,
            ai: aiHealthy === null ? 'disabled' : aiHealthy ? 'ok' : 'unavailable',
        };
    });
}
