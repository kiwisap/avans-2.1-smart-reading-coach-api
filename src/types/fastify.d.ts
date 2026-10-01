import type { GridFSBucket, Db, MongoClient } from 'mongodb';
import type pg from 'pg';
import type { UserRole } from '../auth/roles.js';
import type { Database } from '../db/types.js';
import type { Locale } from '../i18n.js';

// Teach TypeScript about the things our plugins add to Fastify.
declare module 'fastify' {
    interface FastifyInstance {
        pg: pg.Pool;
        db: Database;
        mongo: { client: MongoClient; db: Db; files: GridFSBucket };
        authenticate: (request: FastifyRequest) => Promise<void>;
        authorize: (...roles: UserRole[]) => (request: FastifyRequest) => Promise<void>;
    }
    interface FastifyRequest {
        locale: Locale;
    }
}

// The data stored in the JWT, available as request.user after authentication.
declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: { sub: string; role: UserRole };
        user: { sub: string; role: UserRole };
    }
}
