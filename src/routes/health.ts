import type { FastifyInstance } from 'fastify';
import { ok } from '../openapi/helpers.js';

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
    const schema = {
        tags: ['System'],
        summary: 'Check that the API and both databases respond',
        response: { 200: ok('Health', 'The API runs.') },
    };

    fastify.get('/health', { schema }, async () => {
        const pgResult = await fastify.pg.query('SELECT 1 AS ok');
        const mongoResult = await fastify.mongo.db.command({ ping: 1 });
        return {
            status: 'ok',
            postgres: pgResult.rows[0].ok === 1,
            mongo: mongoResult.ok === 1,
        };
    });
}
