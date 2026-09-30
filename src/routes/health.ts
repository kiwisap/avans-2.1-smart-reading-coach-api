import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/health', async () => {
        const pgResult = await fastify.pg.query('SELECT 1 AS ok');
        const mongoResult = await fastify.mongo.db.command({ ping: 1 });
        return {
            status: 'ok',
            postgres: pgResult.rows[0].ok === 1,
            mongo: mongoResult.ok === 1,
        };
    });
}
