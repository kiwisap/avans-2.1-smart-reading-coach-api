import type { FastifyInstance } from 'fastify';
import { HttpError } from '../errors.js';
import { createUserRepository } from '../repositories/userRepository.js';
import {
    createAuthService,
    toPublicUser,
    type LoginInput,
    type PublicUser,
    type RegisterInput,
} from '../services/authService.js';

const credentials = {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 8, maxLength: 72 },
};

const registerSchema = {
    body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        additionalProperties: false,
        properties: {
            ...credentials,
            name: { type: 'string', minLength: 1, maxLength: 100 },
        },
    },
};

const loginSchema = {
    body: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
            email: credentials.email,
            password: { type: 'string', minLength: 1, maxLength: 72 },
        },
    },
};

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
    const userRepository = createUserRepository(fastify.db);
    const authService = createAuthService({ userRepository });

    const issueToken = (user: PublicUser): string =>
        fastify.jwt.sign({ sub: user.id, role: user.role });

    fastify.post<{ Body: RegisterInput }>(
        '/auth/register',
        { schema: registerSchema },
        async (request, reply) => {
            const user = await authService.register(request.body);
            return reply.code(201).send({ token: issueToken(user), user });
        },
    );

    fastify.post<{ Body: LoginInput }>('/auth/login', { schema: loginSchema }, async (request) => {
        const user = await authService.login(request.body);
        return { token: issueToken(user), user };
    });

    fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request) => {
        const user = await userRepository.findById(request.user.sub);
        if (!user) throw new HttpError(401, 'Account no longer exists');
        return { user: toPublicUser(user) };
    });
}
