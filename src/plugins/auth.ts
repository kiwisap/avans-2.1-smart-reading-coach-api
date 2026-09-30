import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyRequest } from 'fastify';
import type { UserRole } from '../auth/roles.js';
import { HttpError } from '../errors.js';

export default fp<{ secret: string; expiresIn: string }>(async (fastify, opts) => {
    await fastify.register(jwt, {
        secret: opts.secret,
        sign: { expiresIn: opts.expiresIn },
    });

    // Requires a valid Bearer token. Puts the payload on request.user ({ sub, role }).
    fastify.decorate('authenticate', async (request: FastifyRequest): Promise<void> => {
        try {
            await request.jwtVerify();
        } catch {
            throw new HttpError(401, 'Je bent niet ingelogd of je sessie is verlopen');
        }
    });

    // Requires a valid token AND one of the given roles.
    fastify.decorate(
        'authorize',
        (...roles: UserRole[]) =>
            async (request: FastifyRequest): Promise<void> => {
                await fastify.authenticate(request);
                if (!roles.includes(request.user.role)) {
                    throw new HttpError(403, 'Je hebt geen toegang tot deze pagina');
                }
            },
    );
});
