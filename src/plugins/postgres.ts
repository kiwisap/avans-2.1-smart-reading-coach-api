import fp from 'fastify-plugin';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';

export default fp<{ connectionString: string }>(async (fastify, opts) => {
    const pool = new pg.Pool({ connectionString: opts.connectionString });
    await pool.query('SELECT 1');

    fastify.decorate('pg', pool); // raw pool, used by the health check
    fastify.decorate('db', drizzle(pool, { schema })); // Drizzle ORM instance
    fastify.addHook('onClose', async () => {
        await pool.end();
    });
});
